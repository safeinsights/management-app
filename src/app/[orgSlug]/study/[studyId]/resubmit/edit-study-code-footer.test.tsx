import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { memoryRouter } from 'next-router-mock'
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider, useEditCodeResubmit } from '@/contexts/edit-code-resubmit'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { resubmitStudyCodeAction, saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-request'
import { EditStudyCodeFooter } from './edit-study-code-footer'

// The real note textarea on the footer's form context, so a test can make a genuine session edit.
const NoteInput = () => {
    const { noteForm } = useEditCodeResubmit()
    return <ResubmissionNoteSection noteForm={noteForm} orgName="Reviewing Org" />
}

vi.mock('@/server/actions/study-request', () => ({
    resubmitStudyCodeAction: vi.fn(),
    saveCodeResubmissionNoteDraftAction: vi.fn().mockResolvedValue({ studyId: '', savedAt: '' }),
}))

const EXIT_TARGET = `/lab-1/study/${'11111111-1111-4111-8111-111111111111'}/view`

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

const renderFooter = (
    opts: {
        initialNote?: string
        mainFileName?: string
        fileNames?: string[]
        filesEdited?: boolean
        withNoteInput?: boolean
    } = {},
) => {
    ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
    return renderWithProviders(
        <EditCodeResubmitProvider studyId={STUDY_ID} initialNote={opts.initialNote ?? ''}>
            {opts.withNoteInput && <NoteInput />}
            <EditStudyCodeFooter
                mainFileName={opts.mainFileName ?? ''}
                fileNames={opts.fileNames ?? []}
                hasFiles={(opts.fileNames ?? []).length > 0}
                filesEdited={opts.filesEdited ?? false}
            />
        </EditCodeResubmitProvider>,
    )
}

describe('EditStudyCodeFooter', () => {
    it('disables Resubmit when there are no files', () => {
        renderFooter({ initialNote: wordsString(5) })
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeDisabled()
    })

    it('disables Resubmit when the note is empty even with files present', () => {
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'] })
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeDisabled()
    })

    it('disables Resubmit when no main file is selected, even with files and a valid note', () => {
        renderFooter({ initialNote: wordsString(10), mainFileName: '', fileNames: ['a.R', 'b.R'] })
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeDisabled()
    })

    it('opens the confirmation modal with the OTTER-563 copy when Resubmit is clicked', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Resubmit code for review?')
        expect(dialog).toHaveTextContent(
            /Please confirm you are ready to resubmit your study code\. Further edits are not permitted once submitted\./,
        )
        expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Resubmit code' })).toBeInTheDocument()
    })

    it('dismisses the modal when Cancel is clicked, leaving the user on the edit page', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

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
        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        const dialog = screen.getByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: /close/i }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(vi.mocked(resubmitStudyCodeAction)).not.toHaveBeenCalled()
    })

    it('calls resubmitStudyCodeAction when "Resubmit code" is confirmed', async () => {
        const user = userEvent.setup()
        vi.mocked(resubmitStudyCodeAction).mockResolvedValueOnce({ studyJobId: 'new-job' })
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R', 'helper.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        const dialog = screen.getByRole('dialog')
        await user.click(within(dialog).getByRole('button', { name: 'Resubmit code' }))

        await waitFor(() =>
            expect(vi.mocked(resubmitStudyCodeAction)).toHaveBeenCalledWith({
                studyId: STUDY_ID,
                mainFileName: 'main.R',
                fileNames: ['main.R', 'helper.R'],
                resubmissionNote: wordsString(10),
            }),
        )
    })

    // OTTER-673: one subtle "Previous step" whatever the edit state; it flushes pending edits on
    // the way out rather than offering a separate Save and exit.
    it('steps back to the study view without saving when nothing has changed', async () => {
        const user = userEvent.setup()
        memoryRouter.setCurrentUrl('/start')
        renderFooter({ initialNote: wordsString(3) })

        const previous = screen.getByRole('button', { name: 'Previous step' })
        expect(previous).toHaveAttribute('data-variant', 'subtle')
        expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save and exit' })).not.toBeInTheDocument()

        await user.click(previous)

        await waitFor(() => expect(memoryRouter.asPath).toBe(EXIT_TARGET))
        expect(vi.mocked(saveCodeResubmissionNoteDraftAction)).not.toHaveBeenCalled()
    })

    it('saves the note edited this session, then steps back to the study view', async () => {
        const user = userEvent.setup()
        memoryRouter.setCurrentUrl('/start')
        vi.mocked(saveCodeResubmissionNoteDraftAction).mockClear()
        renderFooter({ initialNote: wordsString(3), withNoteInput: true })

        await user.type(screen.getByRole('textbox', { name: 'Resubmission Note' }), ' more')
        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(EXIT_TARGET))
        expect(vi.mocked(saveCodeResubmissionNoteDraftAction)).toHaveBeenCalled()
    })

    // OTTER-558: file edits this session count as changes even with an empty note. The files
    // themselves already live in the workspace, so there is no note to flush and the step still
    // completes.
    it('steps back when only files have been edited this session', async () => {
        const user = userEvent.setup()
        memoryRouter.setCurrentUrl('/start')
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], filesEdited: true })

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(EXIT_TARGET))
    })
})
