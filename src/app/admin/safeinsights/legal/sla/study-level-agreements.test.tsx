import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '@/database'
import {
    actionResult,
    faker,
    insertTestOrg,
    insertTestUser,
    mockSessionWithTestData,
    renderWithProviders,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { StudyLevelAgreements } from './study-level-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations are passed to vi.fn rather than set with mockResolvedValue: the suite runs
        // with mockReset, which restores the implementation given here but wipes a value set after.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrl: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

// An approved study with no SLA yet: what the upload cascade offers, and what the form's empty
// state depends on the absence of.
const seedApprovedStudy = async (title: string) => {
    const dataPartner = await insertTestOrg({ slug: faker.string.alpha(10), type: 'enclave' })
    const researchLab = await insertTestOrg({ slug: faker.string.alpha(10), type: 'lab' })
    const { user: researcher } = await insertTestUser({
        org: { id: researchLab.id, slug: researchLab.slug, type: 'lab' },
    })
    const study = await db
        .insertInto('study')
        .values({
            orgId: dataPartner.id,
            submittedByOrgId: researchLab.id,
            containerLocation: 'test-container',
            title,
            researcherId: researcher.id,
            piName: 'test',
            status: 'APPROVED',
            dataSources: ['all'],
            outputMimeType: 'application/zip',
            language: 'R',
        })
        .returningAll()
        .executeTakeFirstOrThrow()

    return { study, dataPartner, researchLab }
}

const seedSignedSla = async ({ signedAt, title }: { signedAt: string; title: string }) => {
    const seeded = await seedApprovedStudy(title)

    const { version } = actionResult(
        await createLegalDocumentDraftAction({ type: 'sla', studyId: seeded.study.id, fileName: 'sla.pdf' }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))

    return seeded
}

// Scoped to one study's row: the table shows every SLA the suite has seeded.
const openNewVersionFor = async (title: string) => {
    await waitFor(() => expect(screen.getByText(title)).toBeDefined())
    const row = screen.getByText(title).closest('tr')
    if (!row) throw new Error(`no table row for ${title}`)
    fireEvent.click(within(row).getByRole('button', { name: 'Upload new version' }))
    await waitFor(() => expect(screen.getByText('Upload a new version')).toBeDefined())
}

// The dropzone keeps a real file input behind it, so the file goes in directly.
const chooseFile = (name: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['pdf bytes'], name, { type: 'application/pdf' })] } })
}

describe('StudyLevelAgreements', () => {
    it('shows a published agreement with its study, orgs and the signed date as stored', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const { dataPartner, researchLab } = await seedSignedSla({
            signedAt: '2026-07-27',
            title: `SLA study ${faker.string.alpha(6)}`,
        })

        renderWithProviders(<StudyLevelAgreements />)

        await waitFor(() => expect(screen.getByText(researchLab.name)).toBeDefined())
        expect(screen.getByText(dataPartner.name)).toBeDefined()
        // Guards the off-by-one: the day entered must be the day rendered.
        expect(screen.getByText('2026-07-27')).toBeDefined()
    })

    it('carries the study over when adding a version, collecting only a date and file', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `SLA study ${faker.string.alpha(6)}`
        await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyLevelAgreements />)

        await openNewVersionFor(title)

        // The study is fixed, so there is nothing to pick.
        expect(screen.queryByPlaceholderText('Select a Data Partner')).toBeNull()
        expect(screen.getByText(/This study is on version 1\./)).toBeDefined()
        expect(screen.getByText('Signed Study Level Agreement')).toBeDefined()
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-sla.pdf')

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled())
    })

    it('lists the study, orgs, date and file in the publish confirmation', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `SLA study ${faker.string.alpha(6)}`
        const { dataPartner, researchLab } = await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyLevelAgreements />)

        await openNewVersionFor(title)
        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-sla.pdf')

        fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))

        // Both modals are open at once, so the assertions are scoped to the confirmation.
        const confirmation = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Publish this file?'))
            if (!dialog) throw new Error('confirmation modal did not open')
            return dialog
        })

        expect(within(confirmation).getByText(title)).toBeDefined()
        expect(within(confirmation).getByText(researchLab.name)).toBeDefined()
        expect(within(confirmation).getByText(dataPartner.name)).toBeDefined()
        expect(within(confirmation).getByText('2026-08-03')).toBeDefined()
        expect(within(confirmation).getByText('signed-sla.pdf')).toBeDefined()
        // A version 2 resets everyone's acknowledgement, which the admin has to be told before sending.
        expect(
            within(confirmation).getByText(/Acknowledgements of the current version do not carry over/),
        ).toBeDefined()
    })

    it('collects the study, date and file on one screen, with Publish held until all three are given', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        // Seeded rather than relying on whatever else the suite left approved: with no candidates
        // the form renders its empty state and there are no selects to assert on.
        await seedApprovedStudy(`SLA candidate ${faker.string.alpha(6)}`)

        renderWithProviders(<StudyLevelAgreements />)

        fireEvent.click(screen.getByRole('button', { name: 'Upload signed SLA' }))

        await waitFor(() => expect(screen.getByText('Upload a signed SLA')).toBeDefined())
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
        expect(screen.getByLabelText('Signed on')).toBeDefined()
        expect(screen.getByText('Signed Study Level Agreement')).toBeDefined()
        // Queried by placeholder because "Research Lab" also names a column in the table behind.
        expect(screen.getByPlaceholderText('Select a Research Lab')).toBeDisabled()
    })

    it('opens the version history for a study without loading it up front', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `SLA study ${faker.string.alpha(6)}`
        await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyLevelAgreements />)

        await waitFor(() => expect(screen.getByText(title)).toBeDefined())
        const row = screen.getByText(title).closest('tr')
        if (!row) throw new Error(`no table row for ${title}`)
        fireEvent.click(within(row).getByRole('button', { name: 'Version History' }))

        const history = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Published by'))
            if (!dialog) throw new Error('version history did not open')
            return dialog
        })

        expect(within(history).getByText('2026-07-27')).toBeDefined()
    })
})
