import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { db } from '@/database'
import {
    actionResult,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    userEvent,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { RequireLegalAcknowledgement } from './require-acknowledgement'

// The upload happens client-side, so only the AWS boundary is stubbed.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const TERMS_BODY = 'The terms you must accept.'

// Mocking `@/server/aws` does not reach storage's own import of it.
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async () => new Blob([TERMS_BODY])),
}))

// The gate answers for every published tos/pn, so a seeded database would leave a second
// document outstanding behind the one under test.
beforeEach(resetLegalDocuments)

const publish = async (type: 'TOS' | 'PN', fileName: string) => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type, fileName }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

const publishTos = () => publish('TOS', 'terms.md')

const acknowledgementsFor = (userId: string) =>
    db
        .selectFrom('legalDocumentAcknowledgement')
        .selectAll('legalDocumentAcknowledgement')
        .where('userId', '=', userId)
        .execute()

describe('RequireLegalAcknowledgement', () => {
    it('stays out of the way when nothing is outstanding', async () => {
        await mockSessionWithTestData()

        renderWithProviders(<RequireLegalAcknowledgement />)

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('records the acknowledgement and lets the user through', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const version = await publishTos()

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)

        expect(await screen.findByText(TERMS_BODY)).toBeDefined()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(async () => {
            const acks = await acknowledgementsFor(user.id)
            expect(acks).toHaveLength(1)
            expect(acks[0]!.legalDocumentVersionId).toBe(version.id)
        })
        await waitFor(() => expect(screen.queryByText(/The Terms of Service/)).toBeNull())
    })

    it('asks about one document at a time', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await publishTos()
        await publish('PN', 'privacy.md')

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)

        expect(await screen.findByText(/The Terms of Service is now available/)).toBeDefined()
        expect(screen.queryByText(/Privacy Notice/)).toBeNull()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(await screen.findByText(/The Privacy Notice is now available/)).toBeDefined()
        expect(screen.queryByText(/Terms of Service/)).toBeNull()
        expect(screen.getByRole('checkbox')).not.toBeChecked()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        await waitFor(async () => expect(await acknowledgementsFor(user.id)).toHaveLength(2))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    // Matched whole: the thrown ActionFailure's message is the JSON of its field errors, which a
    // looser match would still satisfy.
    it('shows why an acknowledgement was refused rather than silently reopening', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const version = await publishTos()

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)
        expect(await screen.findByText(TERMS_BODY)).toBeDefined()

        // All three columns together, or the row fails its draft-or-published check constraint.
        await db
            .updateTable('legalDocumentVersion')
            .set({ publishedAt: null, publishedBy: null, versionNumber: null })
            .where('id', '=', version.id)
            .execute()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(await screen.findByText('Version is not published and cannot be acknowledged')).toBeDefined()
        expect(await acknowledgementsFor(user.id)).toHaveLength(0)
    })
})
