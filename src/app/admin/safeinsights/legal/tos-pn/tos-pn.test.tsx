import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { actionResult, db, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    fetchLegalDocumentVersionsAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { TosPnUpload } from './tos-pn'

// The two S3 presign helpers are stubbed the same way the other legal suites do it: the browser
// does the real upload, so there is nothing to hit. Implementations go to vi.fn (not
// mockResolvedValue) so mockReset keeps them between tests.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

// One stub serves both fetches the UI makes: the browser upload POST (uploadFiles checks
// response.ok) and PreviewDocument's GET of the signed URL (reads response.text()).
beforeEach(async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, text: async () => '# Terms of Service' }) as unknown as Response),
    )
    await db.deleteFrom('legalDocumentAcknowledgement').execute()
    await db.deleteFrom('legalDocumentVersion').execute()
    await db.deleteFrom('legalDocument').execute()
})

const seedPublishedTos = async (fileName: string) => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

const seedDraftTos = (fileName: string) =>
    createLegalDocumentDraftAction({ type: 'TOS', fileName }).then((r) => actionResult(r).version)

describe('TosPnUpload', () => {
    it('shows no published version and an empty history before anything is uploaded', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<TosPnUpload doctype="TOS" />)

        expect(await screen.findByText('No published version yet')).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'Version History' }))

        expect(await screen.findByText('No versions have been published yet.')).toBeDefined()
    })

    it('shows the published version as the current linked copy', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedPublishedTos('terms.md')

        renderWithProviders(<TosPnUpload doctype="TOS" />)

        expect(await screen.findByRole('button', { name: 'Version 1' })).toBeDefined()
        expect(screen.getByText(/Published on/)).toBeDefined()
    })

    it('lists prior versions in the history modal', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedPublishedTos('terms-v1.md')
        await seedPublishedTos('terms-v2.md')

        renderWithProviders(<TosPnUpload doctype="TOS" />)

        // The newest version is the current one shown up top; both live in the history.
        await screen.findByRole('button', { name: 'Version 2' })

        fireEvent.click(screen.getByRole('button', { name: 'Version History' }))

        const history = await screen.findByRole('dialog', { name: /version history/i })
        expect(within(history).getAllByRole('button', { name: 'View' })).toHaveLength(2)
    })

    // tos/pn are markdown: a link to the signed URL would hand the admin raw source, so the history
    // modal renders the document itself.
    it('renders a version from the history rather than linking to the raw file', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedPublishedTos('terms.md')

        renderWithProviders(<TosPnUpload doctype="TOS" />)

        fireEvent.click(await screen.findByRole('button', { name: 'Version History' }))

        const history = await screen.findByRole('dialog', { name: /version history/i })
        fireEvent.click(within(history).getByRole('button', { name: 'View' }))

        expect(await screen.findByRole('heading', { name: 'Terms of Service' })).toBeDefined()
    })

    it('opens the modal to the upload page when no draft exists', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<TosPnUpload doctype="TOS" />)

        fireEvent.click(await screen.findByRole('button', { name: /upload/i }))

        expect(await screen.findByText('Upload your draft document here:')).toBeDefined()
    })

    it('walks an existing draft through review and confirmation, then publishes it', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedDraftTos('terms.md')

        renderWithProviders(<TosPnUpload doctype="TOS" />)

        // A pending draft means the modal opens straight to the review page.
        fireEvent.click(await screen.findByRole('button', { name: /upload/i }))
        await screen.findByText('Review your saved draft:')

        fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

        // The confirmation step spells out that publishing is irreversible.
        await screen.findByText('Publish this file?')
        expect(screen.getByText(/cannot be undone/i)).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

        // Publishing closes the modal and the draft becomes the current version.
        expect(await screen.findByRole('button', { name: 'Version 1' })).toBeDefined()

        // And it is recorded as published — version 1, no draft left behind.
        const { current, draft } = actionResult(await fetchLegalDocumentVersionsAction({ type: 'TOS' }))
        expect(current?.versionNumber).toBe(1)
        expect(draft).toBeNull()
    })
})
