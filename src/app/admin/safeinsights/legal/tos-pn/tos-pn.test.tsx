import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { actionResult, mockSessionWithTestData, renderWithProviders, resetLegalDocuments } from '@/tests/unit.helpers'
import {
    createLegalDocumentDraftAction,
    fetchLegalDocumentVersionsAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { TosPnPanel } from './tos-pn'

// Implementations go to vi.fn (not mockResolvedValue) so mockReset keeps them between tests.
vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

// One stub serves both fetches the UI makes: the upload POST and PreviewDocument's GET.
beforeEach(async () => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, text: async () => '# Terms of Service' }) as unknown as Response),
    )
    await resetLegalDocuments()
})

const seedPublishedTos = async (fileName: string) => {
    const { version } = actionResult(await createLegalDocumentDraftAction({ type: 'TOS', fileName }))
    return actionResult(await publishLegalDocumentVersionAction({ versionId: version.id }))
}

const seedDraftTos = (fileName: string) =>
    createLegalDocumentDraftAction({ type: 'TOS', fileName }).then((r) => actionResult(r).version)

describe('TosPnPanel', () => {
    it('shows no published version and an empty history before anything is uploaded', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<TosPnPanel doctype="TOS" />)

        expect(await screen.findByText('No published version yet')).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'Version History' }))

        expect(await screen.findByText('No versions have been published yet.')).toBeDefined()
    })

    it('shows the published version as the current linked copy', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedPublishedTos('terms.md')

        renderWithProviders(<TosPnPanel doctype="TOS" />)

        expect(await screen.findByRole('button', { name: 'Version 1' })).toBeDefined()
        expect(screen.getByText(/Published on/)).toBeDefined()
    })

    it('lists prior versions in the history modal', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedPublishedTos('terms-v1.md')
        await seedPublishedTos('terms-v2.md')

        renderWithProviders(<TosPnPanel doctype="TOS" />)

        await screen.findByRole('button', { name: 'Version 2' })

        fireEvent.click(screen.getByRole('button', { name: 'Version History' }))

        const history = await screen.findByRole('dialog', { name: /version history/i })
        expect(within(history).getAllByRole('button', { name: 'View' })).toHaveLength(2)
    })

    it('renders a version from the history rather than linking to the raw file', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedPublishedTos('terms.md')

        renderWithProviders(<TosPnPanel doctype="TOS" />)

        fireEvent.click(await screen.findByRole('button', { name: 'Version History' }))

        const history = await screen.findByRole('dialog', { name: /version history/i })
        fireEvent.click(within(history).getByRole('button', { name: 'View' }))

        expect(await screen.findByRole('heading', { name: 'Terms of Service' })).toBeDefined()
    })

    it('opens the modal to the upload page when no draft exists', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })

        renderWithProviders(<TosPnPanel doctype="TOS" />)

        fireEvent.click(await screen.findByRole('button', { name: /upload/i }))

        expect(await screen.findByText('Upload your draft document here:')).toBeDefined()
    })

    it('walks an existing draft through review and confirmation, then publishes it', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        await seedDraftTos('terms.md')

        renderWithProviders(<TosPnPanel doctype="TOS" />)

        fireEvent.click(await screen.findByRole('button', { name: /upload/i }))
        await screen.findByText('Review your saved draft:')

        fireEvent.click(screen.getByRole('button', { name: 'Publish' }))

        await screen.findByText('Publish this file?')
        expect(screen.getByText(/cannot be undone/i)).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

        expect(await screen.findByRole('button', { name: 'Version 1' })).toBeDefined()

        const { current, draft } = actionResult(await fetchLegalDocumentVersionsAction({ type: 'TOS' }))
        expect(current?.versionNumber).toBe(1)
        expect(draft).toBeNull()
    })
})
