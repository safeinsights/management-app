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
import { StudyAgreements } from './study-agreements'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        // Implementations go to vi.fn, not mockResolvedValue: mockReset would wipe a value set after.
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

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
        await createLegalDocumentDraftAction({
            type: 'SLA',
            studyId: seeded.study.id,
            fileName: 'study-agreement.pdf',
        }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))

    return seeded
}

const openNewVersionFor = async (title: string) => {
    await waitFor(() => expect(screen.getByText(title)).toBeDefined())
    const row = screen.getByText(title).closest('tr')
    if (!row) throw new Error(`no table row for ${title}`)
    fireEvent.click(within(row).getByRole('button', { name: 'Upload new version' }))
    await waitFor(() => expect(screen.getByText('Upload a new version')).toBeDefined())
}

const chooseFile = (name: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['pdf bytes'], name, { type: 'application/pdf' })] } })
}

describe('StudyAgreements', () => {
    it('shows a published agreement with its study, orgs and the signed date in the app date format', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `Study agreement ${faker.string.alpha(6)}`
        const { dataPartner, researchLab } = await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyAgreements />)

        await waitFor(() => expect(screen.getByText(title)).toBeDefined())
        const row = screen.getByText(title).closest('tr')!

        expect(within(row).getByText(researchLab.name)).toBeDefined()
        expect(within(row).getByText(dataPartner.name)).toBeDefined()
        expect(within(row).getByText('Jul 27, 2026')).toBeDefined()
    })

    it('carries the study over when adding a version, collecting only a date and file', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `Study agreement ${faker.string.alpha(6)}`
        await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyAgreements />)

        await openNewVersionFor(title)

        expect(screen.queryByPlaceholderText('Select a Data Partner')).toBeNull()
        expect(screen.getByText(/This study is on version 1\./)).toBeDefined()
        expect(screen.getByText('Signed Study Agreement')).toBeDefined()
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-study-agreement.pdf')

        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).not.toBeDisabled())
    })

    it('lists the study, orgs, date and file in the publish confirmation', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `Study agreement ${faker.string.alpha(6)}`
        const { dataPartner, researchLab } = await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyAgreements />)

        await openNewVersionFor(title)
        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-study-agreement.pdf')

        fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))

        const confirmation = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Publish this file?'))
            if (!dialog) throw new Error('confirmation modal did not open')
            return dialog
        })

        expect(within(confirmation).getByText(title)).toBeDefined()
        expect(within(confirmation).getByText(researchLab.name)).toBeDefined()
        expect(within(confirmation).getByText(dataPartner.name)).toBeDefined()
        expect(within(confirmation).getByText('Aug 03, 2026')).toBeDefined()
        expect(within(confirmation).getByText('signed-study-agreement.pdf')).toBeDefined()
        expect(within(confirmation).getByText(/becomes the current Study Agreement on record/)).toBeDefined()
        expect(within(confirmation).queryByText(/acknowledge/i)).toBeNull()
    })

    it('keeps the confirmation up and the form locked while publishing', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `Study agreement ${faker.string.alpha(6)}`
        await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyAgreements />)

        await openNewVersionFor(title)
        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        chooseFile('signed-study-agreement.pdf')
        fireEvent.click(await screen.findByRole('button', { name: 'Publish' }))

        const confirmation = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Publish this file?'))
            if (!dialog) throw new Error('confirmation modal did not open')
            return dialog
        })

        fireEvent.click(within(confirmation).getByRole('button', { name: 'Yes, publish' }))

        expect(within(confirmation).getByText('Publish this file?')).toBeDefined()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled())
    })

    it('collects the study, date and file on one screen, with Publish held until all three are given', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        // With no candidates the form renders its empty state and there are no selects to assert on.
        await seedApprovedStudy(`Study agreement candidate ${faker.string.alpha(6)}`)

        renderWithProviders(<StudyAgreements />)

        fireEvent.click(screen.getByRole('button', { name: 'Upload signed study agreement' }))

        await waitFor(() => expect(screen.getByText('Upload a signed study agreement')).toBeDefined())
        expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
        expect(screen.getByLabelText('Signed on')).toBeDefined()
        expect(screen.getByText('Signed Study Agreement')).toBeDefined()
        expect(screen.getByPlaceholderText('Select a Research Lab')).toBeDisabled()
    })

    it('opens the version history for a study without loading it up front', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `Study agreement ${faker.string.alpha(6)}`
        await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyAgreements />)

        await waitFor(() => expect(screen.getByText(title)).toBeDefined())
        const row = screen.getByText(title).closest('tr')
        if (!row) throw new Error(`no table row for ${title}`)
        fireEvent.click(within(row).getByRole('button', { name: 'Version History' }))

        const history = await waitFor(() => {
            const dialog = screen.getAllByRole('dialog').find((el) => within(el).queryByText('Published by'))
            if (!dialog) throw new Error('version history did not open')
            return dialog
        })

        // findByText: the table header renders before the versions arrive.
        expect(await within(history).findByText('Jul 27, 2026')).toBeDefined()
    })
})
