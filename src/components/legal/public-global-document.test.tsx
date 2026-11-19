import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import {
    actionResult,
    mockClerkSession,
    mockSessionWithTestData,
    renderWithProviders,
    resetLegalDocuments,
    testUploadFile,
} from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { PublicGlobalDocument } from './public-global-document'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        storeS3File: vi.fn(),
    }
})

// Echoing the key back tells the two documents apart, since each key carries its type.
vi.mock('@/server/storage', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/server/storage')>()),
    fetchFileContents: vi.fn(async (path: string) => new Blob([`content of ${path}`])),
}))

// The dev database ships a published ToS and PN, which would satisfy the nothing-published case.
beforeEach(resetLegalDocuments)

const publishBoth = async () => {
    await mockSessionWithTestData({ isSiAdmin: true })
    for (const [type, fileName] of [
        ['TOS', 'terms.md'],
        ['PN', 'privacy.md'],
    ] as const) {
        const { version } = actionResult(await createLegalDocumentDraftAction({ type, file: testUploadFile(fileName) }))
        actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
    }
    mockClerkSession(null)
}

describe('PublicGlobalDocument', () => {
    it.each([
        ['TOS', /content of legal\/TOS\//, /content of legal\/PN\//],
        ['PN', /content of legal\/PN\//, /content of legal\/TOS\//],
    ] as const)('shows only the published %s to a signed-out visitor', async (type, shown, hidden) => {
        await publishBoth()

        renderWithProviders(await PublicGlobalDocument({ type }))

        expect(screen.getByText(shown)).toBeInTheDocument()
        expect(screen.queryByText(hidden)).not.toBeInTheDocument()
    })

    it('says so when nothing has been published yet', async () => {
        mockClerkSession(null)

        renderWithProviders(await PublicGlobalDocument({ type: 'PN' }))

        expect(screen.getByRole('heading', { name: 'Privacy Notice' })).toBeInTheDocument()
        expect(screen.getByText('The Privacy Notice has not been published yet.')).toBeInTheDocument()
    })

    it('offers no way to navigate elsewhere', async () => {
        await publishBoth()

        renderWithProviders(await PublicGlobalDocument({ type: 'TOS' }))

        expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
        expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
})
