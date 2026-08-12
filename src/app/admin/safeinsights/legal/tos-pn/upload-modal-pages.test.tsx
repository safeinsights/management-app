import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { actionResult, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { ConfirmPublishForm, DraftForm, PreviewDocument } from './upload-modal-pages'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

// Default: every fetch (the upload POST and the preview GET) succeeds. Individual tests override.
beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, text: async () => '# Terms of Service' }) as unknown as Response),
    )
})

// The dropzone keeps a real file input behind it, so the file goes in directly.
const chooseFile = (name: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['# terms'], name, { type: 'text/markdown' })] } })
}

describe('ConfirmPublishForm', () => {
    it('shows the file, warns publishing is irreversible, and wires both buttons', () => {
        const onPublish = vi.fn()
        const onBack = vi.fn()

        renderWithProviders(
            <ConfirmPublishForm draftName="terms.md" onPublish={onPublish} onBack={onBack} isPublishing={false} />,
        )

        expect(screen.getByText('terms.md')).toBeDefined()
        expect(screen.getByText(/cannot be undone/i)).toBeDefined()

        fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
        expect(onPublish).toHaveBeenCalledTimes(1)

        fireEvent.click(screen.getByRole('button', { name: 'Back' }))
        expect(onBack).toHaveBeenCalledTimes(1)
    })
})

describe('DraftForm', () => {
    it('keeps Save Draft disabled until a file is chosen', async () => {
        renderWithProviders(<DraftForm doctype="TOS" draftName={null} onDraftSaved={vi.fn()} />)

        expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled()

        chooseFile('terms.md')

        await waitFor(() => expect(screen.getByRole('button', { name: /save draft/i })).not.toBeDisabled())
    })

    it('uploads the chosen file as a draft and notifies the parent', async () => {
        await mockSessionWithTestData({ isSiAdmin: true })
        const onDraftSaved = vi.fn()

        renderWithProviders(<DraftForm doctype="TOS" draftName={null} onDraftSaved={onDraftSaved} />)

        chooseFile('terms.md')
        const saveButton = await screen.findByRole('button', { name: /save draft/i })
        await waitFor(() => expect(saveButton).toBeEnabled())
        fireEvent.click(saveButton)

        await waitFor(() => expect(onDraftSaved).toHaveBeenCalled())

        // The upload is recorded as the pending (unpublished) version in the database.
        const { draft } = actionResult(await fetchLegalDocumentVersionsAction({ type: 'TOS' }))
        expect(draft?.fileName).toBe('terms.md')
    })
})

describe('PreviewDocument', () => {
    it('surfaces an error when the document cannot be loaded', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response),
        )

        renderWithProviders(<PreviewDocument url="https://example.com/doc.md" label="Terms of Service" />)

        // ErrorAlert always renders its default title.
        expect(await screen.findByText('An error occurred')).toBeDefined()
    })
})
