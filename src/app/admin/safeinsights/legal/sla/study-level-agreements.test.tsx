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
        signedUrlForFile: vi.fn().mockResolvedValue('https://mock-signed-url.example.com/file'),
        createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://mock-s3.example.com', fields: { key: 'k' } }),
    }
})

const seedSignedSla = async ({ signedAt, title }: { signedAt: string; title: string }) => {
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

    const { version } = actionResult(
        await createLegalDocumentDraftAction({
            type: 'sla',
            studyId: study.id,
            fileName: 'sla.pdf',
            format: 'pdf',
        }),
    )
    actionResult(await publishLegalDocumentVersionAction({ versionId: version.id, signedAt }))

    return { study, dataPartner, researchLab }
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

    it('offers a new version for a study that already has an SLA, with the cascade skipped', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const title = `SLA study ${faker.string.alpha(6)}`
        await seedSignedSla({ signedAt: '2026-07-27', title })

        renderWithProviders(<StudyLevelAgreements />)

        // Scoped to this study's row: the table shows every SLA the suite has seeded.
        await waitFor(() => expect(screen.getByText(title)).toBeDefined())
        const row = screen.getByText(title).closest('tr')
        if (!row) throw new Error(`no table row for ${title}`)
        fireEvent.click(within(row).getByRole('button', { name: 'Upload new version' }))

        await waitFor(() => expect(screen.getByText('Upload a new version')).toBeDefined())
        // The study is fixed, so there is nothing to pick — only a signing date.
        expect(screen.queryByPlaceholderText('Select a Data Partner')).toBeNull()
        expect(screen.getByText(/This study is on version 1\./)).toBeDefined()
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Signed on'), { target: { value: '2026-08-03' } })
        await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled())

        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
        await waitFor(() => expect(screen.getByText('Signed agreement')).toBeDefined())
    })

    it('opens the upload modal and keeps Next disabled until a study and date are chosen', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<StudyLevelAgreements />)

        fireEvent.click(screen.getByRole('button', { name: 'Upload signed SLA' }))

        await waitFor(() => expect(screen.getByText('Upload a signed SLA')).toBeDefined())
        expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
        // Queried by placeholder because "Research Lab" also names a column in the table behind.
        expect(screen.getByPlaceholderText('Select a Research Lab')).toBeDisabled()
    })
})
