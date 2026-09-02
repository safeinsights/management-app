import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { db } from '@/database'
import {
    actionResult,
    mockClerkSession,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
} from '@/tests/unit.helpers'
import {
    acknowledgeLegalDocumentAction,
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { UserGlobalDocument } from './user-global-document'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async () => new Blob(['## These are the terms'])),
}))

// The dev database ships a published ToS and PN, which would satisfy the nothing-published case.
beforeEach(resetLegalDocuments)

const publishTos = async () => {
    await mockSessionWithTestData({ isSiAdmin: true })
    const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName: 'terms.md' }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

const asReader = (user: { id: string; clerkId: string; email: string | null }, org: { id: string; slug: string }) =>
    mockClerkSession({
        userId: user.id,
        clerkUserId: user.clerkId,
        email: user.email ?? undefined,
        orgSlug: org.slug,
        orgId: org.id,
        roles: { isAdmin: false },
        orgType: 'enclave',
    })

describe('UserGlobalDocument', () => {
    it('renders the markdown with both dates once acknowledged', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        const version = await publishTos()
        // A fixed publish date, so the assertion is not on today.
        await db
            .updateTable('legalDocumentVersion')
            .set({ publishedAt: new Date('2026-05-03T12:00:00Z') })
            .where('id', '=', version.id)
            .execute()
        await asReader(user, org)
        actionResult(await acknowledgeLegalDocumentAction({ versionId: version.id }))
        await db
            .updateTable('legalDocumentAcknowledgement')
            .set({ ackedAt: new Date('2026-05-10T12:00:00Z') })
            .where('legalDocumentVersionId', '=', version.id)
            .execute()

        renderWithProviders(<UserGlobalDocument type="TOS" />)

        await waitFor(() => expect(screen.getByText('These are the terms')).toBeDefined())
        expect(screen.getByText('Effective on: May 03, 2026')).toBeDefined()
        expect(screen.getByText('Acknowledged on: May 10, 2026')).toBeDefined()
    })

    it('dashes the acknowledgement date when the user owes the current version', async () => {
        const { user, org } = await mockSessionWithTestData({ orgType: 'enclave' })
        await publishTos()
        await asReader(user, org)

        renderWithProviders(<UserGlobalDocument type="TOS" />)

        await waitFor(() => expect(screen.getByText('These are the terms')).toBeDefined())
        expect(screen.getByText('Acknowledged on: —')).toBeDefined()
    })

    it('reports the document as unavailable when nothing is published', async () => {
        await mockSessionWithTestData({ orgType: 'enclave' })

        renderWithProviders(<UserGlobalDocument type="PN" />)

        await waitFor(() => expect(screen.getByText('Not available')).toBeDefined())
        expect(screen.getByRole('heading', { name: 'Privacy Notice' })).toBeDefined()
    })
})
