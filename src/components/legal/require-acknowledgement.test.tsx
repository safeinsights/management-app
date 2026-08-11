import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { db } from '@/database'
import { actionResult, mockSessionWithTestData, renderWithProviders, userEvent } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { RequireLegalAcknowledgement } from './require-acknowledgement'

// The upload happens client-side, so only the AWS boundary is stubbed; the rest hits the real DB.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

const TERMS_BODY = 'The terms you must accept.'

// Document reads go through storage rather than calling S3 directly, and mocking `@/server/aws`
// does NOT reach storage's own import of it.
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async () => new Blob([TERMS_BODY])),
}))

const publishTos = async () => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'tos', fileName: 'terms.md' }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

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
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    // Actions resolve with { error } rather than rejecting, so without actionResult a refusal would
    // run onSuccess and reopen the modal saying nothing — the user would click Continue forever.
    it('shows why an acknowledgement was refused rather than silently reopening', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const version = await publishTos()

        const { user } = await mockSessionWithTestData()
        renderWithProviders(<RequireLegalAcknowledgement />)
        expect(await screen.findByText(TERMS_BODY)).toBeDefined()

        // Withdrawn underneath the open modal. All three columns together, or the row fails its
        // draft-or-published check constraint.
        await db
            .updateTable('legalDocumentVersion')
            .set({ publishedAt: null, publishedBy: null, versionNumber: null })
            .where('id', '=', version.id)
            .execute()

        await userEvent.click(screen.getByRole('checkbox'))
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(await screen.findByText(/is not published/)).toBeDefined()
        expect(await acknowledgementsFor(user.id)).toHaveLength(0)
    })
})
