import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { notifications } from '@mantine/notifications'
import { actionResult, mockSessionWithTestData, renderWithProviders } from '@/tests/unit.helpers'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { ConfirmPublishForm, DraftForm } from './upload-modal-pages'

vi.mock('@/server/aws', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/server/aws')>()
    return {
        ...actual,
        signedUrlForFile: vi.fn(async () => 'https://mock-signed-url.example.com/file'),
        createSignedUploadUrlForKey: vi.fn(async () => ({ url: 'https://mock-s3.example.com', fields: { key: 'k' } })),
    }
})

beforeEach(() => {
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, text: async () => '# Terms of Service' }) as unknown as Response),
    )
})

const chooseFile = (name: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['# terms'], name, { type: 'text/markdown' })] } })
}

describe('ConfirmPublishForm', () => {
    it('shows the file, warns publishing is irreversible, and wires both buttons', () => {
        const onPublish = vi.fn()
        const onBack = vi.fn()

        renderWithProviders(
            <ConfirmPublishForm
                draftName="terms.md"
                onPublish={onPublish}
                onBack={onBack}
                isPublishing={false}
                isSettled={false}
            />,
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

        const { draft } = actionResult(await fetchLegalDocumentVersionsAction({ type: 'TOS' }))
        expect(draft?.fileName).toBe('terms.md')
    })

    it('rejects a non-markdown file: warns the user and does not select it', async () => {
        const notify = vi.spyOn(notifications, 'show').mockReturnValue('test-id')

        renderWithProviders(<DraftForm doctype="TOS" draftName={null} onDraftSaved={vi.fn()} />)

        const input = document.querySelector('input[type="file"]') as HTMLInputElement
        fireEvent.change(input, { target: { files: [new File(['nope'], 'terms.txt', { type: 'text/plain' })] } })

        await waitFor(() => expect(notify).toHaveBeenCalled())

        expect(screen.queryByText('terms.txt')).toBeNull()
        expect(screen.getByRole('button', { name: /save draft/i })).toBeDisabled()
    })
})
