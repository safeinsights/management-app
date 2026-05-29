import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider } from '@/contexts/edit-code-resubmit'
import { resubmitStudyCodeAction } from '@/server/actions/study-request'
import { EditStudyCodeFooter } from './edit-study-code-footer'

vi.mock('@/server/actions/study-request', () => ({
    resubmitStudyCodeAction: vi.fn(),
    saveCodeResubmissionNoteDraftAction: vi.fn().mockResolvedValue({ studyId: '', savedAt: '' }),
}))

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

const renderFooter = (
    opts: { initialNote?: string; mainFileName?: string; fileNames?: string[]; filesChanged?: boolean } = {},
) => {
    ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
    return renderWithProviders(
        <EditCodeResubmitProvider studyId={STUDY_ID} initialNote={opts.initialNote ?? ''}>
            <EditStudyCodeFooter
                mainFileName={opts.mainFileName ?? ''}
                fileNames={opts.fileNames ?? []}
                hasFiles={(opts.fileNames ?? []).length > 0}
                filesChanged={opts.filesChanged ?? false}
            />
        </EditCodeResubmitProvider>,
    )
}

describe('EditStudyCodeFooter', () => {
    it('disables Resubmit when there are no files', () => {
        renderFooter({ initialNote: wordsString(5) })
        expect(screen.getByRole('button', { name: 'Resubmit study code' })).toBeDisabled()
    })

    it('disables Resubmit when the note is empty even with files present', () => {
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'] })
        expect(screen.getByRole('button', { name: 'Resubmit study code' })).toBeDisabled()
    })

    it('opens the confirmation modal with the OTTER-563 copy when Resubmit is clicked', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit study code' }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Confirm study code resubmission?')
        expect(dialog).toHaveTextContent(
            /Please confirm you are ready to resubmit your study code\. Further edits are not permitted once submitted\./,
        )
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Yes, resubmit study code' })).toBeInTheDocument()
    })

    it('dismisses the modal when Cancel is clicked, leaving the user on the edit page', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit study code' }))

        const dialog = screen.getByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(vi.mocked(resubmitStudyCodeAction)).not.toHaveBeenCalled()
    })

    it('dismisses the modal when the X close button is clicked', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit study code' }))

        const dialog = screen.getByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: /close/i }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(vi.mocked(resubmitStudyCodeAction)).not.toHaveBeenCalled()
    })

    it('calls resubmitStudyCodeAction when "Yes, resubmit study code" is confirmed', async () => {
        const user = userEvent.setup()
        vi.mocked(resubmitStudyCodeAction).mockResolvedValueOnce({ studyJobId: 'new-job' })
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R', 'helper.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit study code' }))

        const dialog = screen.getByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Yes, resubmit study code' }))

        await waitFor(() =>
            expect(vi.mocked(resubmitStudyCodeAction)).toHaveBeenCalledWith({
                studyId: STUDY_ID,
                mainFileName: 'main.R',
                fileNames: ['main.R', 'helper.R'],
                resubmissionNote: wordsString(10),
            }),
        )
    })

    it('shows Cancel (not Save and exit) when no changes have been made', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save and exit' })).not.toBeInTheDocument()
    })

    it('shows Save and exit (not Cancel) when the note has content', () => {
        renderFooter({ initialNote: wordsString(3) })
        expect(screen.getByRole('button', { name: 'Save and exit' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })

    it('shows Save and exit when files have changed even with an empty note', () => {
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], filesChanged: true })
        expect(screen.getByRole('button', { name: 'Save and exit' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    })
})
