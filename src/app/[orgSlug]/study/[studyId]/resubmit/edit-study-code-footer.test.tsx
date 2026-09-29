import { useParams } from 'next/navigation'
import { type Mock, describe, expect, it, vi } from 'vitest'
import { memoryRouter } from 'next-router-mock'
import { renderWithProviders, screen, userEvent, waitFor, within } from '@/tests/unit.helpers'
import { EditCodeResubmitProvider, useEditCodeResubmit } from '@/contexts/edit-code-resubmit'
import { ResubmissionNoteSection } from '@/components/study/resubmission-note-section'
import { REQUIRED_NOTE_ERROR } from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { SELECT_MAIN_FILE_MESSAGE, SUBMIT_CODE_ERROR_ID } from '@/components/study/submit-code-error'
import { resubmitStudyCodeAction, saveCodeResubmissionNoteDraftAction } from '@/server/actions/study-request'
import { EditStudyCodeFooter } from './edit-study-code-footer'

const ORG_NAME = 'Reviewing Org'

// The real note textarea on the footer's form context, so a test can make a genuine session edit.
const NoteInput = () => {
    const { noteForm } = useEditCodeResubmit()
    return <ResubmissionNoteSection noteForm={noteForm} orgName={ORG_NAME} />
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
        blockedReason?: string | null
        onSubmitAttempt?: () => void
    } = {},
) => {
    ;(useParams as Mock).mockReturnValue({ orgSlug: 'lab-1' })
    return renderWithProviders(
        <EditCodeResubmitProvider studyId={STUDY_ID} orgName={ORG_NAME} initialNote={opts.initialNote ?? ''}>
            {opts.withNoteInput && <NoteInput />}
            <EditStudyCodeFooter
                mainFileName={opts.mainFileName ?? ''}
                fileNames={opts.fileNames ?? []}
                blockedReason={opts.blockedReason ?? null}
                onSubmitAttempt={opts.onSubmitAttempt ?? (() => {})}
                filesEdited={opts.filesEdited ?? false}
            />
        </EditCodeResubmitProvider>,
    )
}

describe('EditStudyCodeFooter — Resubmit button', () => {
    it('is enabled on first paint even when the resubmission note is empty', () => {
        renderFooter()
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeEnabled()
    })

    it('is enabled when there are no files', () => {
        renderFooter({ initialNote: wordsString(5) })
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeEnabled()
    })

    it('is enabled when no main file is selected', () => {
        renderFooter({ initialNote: wordsString(10), mainFileName: '', fileNames: ['a.R', 'b.R'] })
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeEnabled()
    })

    it('flags an empty resubmission note with the card wording instead of opening the modal', async () => {
        const user = userEvent.setup()
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], withNoteInput: true })

        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        expect(await screen.findByText(REQUIRED_NOTE_ERROR)).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toBeEnabled()
    })

    it('treats a whitespace-only note as empty', async () => {
        const user = userEvent.setup()
        renderFooter({ initialNote: '   ', mainFileName: 'main.R', fileNames: ['main.R'], withNoteInput: true })

        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        expect(await screen.findByText(REQUIRED_NOTE_ERROR)).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('moves focus to the flagged note when it is the only invalid field', async () => {
        const user = userEvent.setup()
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], withNoteInput: true })

        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        await screen.findByText(REQUIRED_NOTE_ERROR)
        expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Resubmission Note' }))
    })

    // OTTER-778: the click used to return silently when files or the main file were missing. It
    // now reports the attempt so the Code files card can name the reason.
    it('reports the attempt so a blocked click can be explained', async () => {
        const user = userEvent.setup()
        const onSubmitAttempt = vi.fn()
        renderFooter({
            initialNote: wordsString(5),
            blockedReason: SELECT_MAIN_FILE_MESSAGE,
            fileNames: ['a.R'],
            onSubmitAttempt,
        })

        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        expect(onSubmitAttempt).toHaveBeenCalledTimes(1)
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('reports the attempt on a clean click too, so a stale message clears', async () => {
        const user = userEvent.setup()
        const onSubmitAttempt = vi.fn()
        renderFooter({ initialNote: wordsString(5), mainFileName: 'main.R', fileNames: ['main.R'], onSubmitAttempt })

        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        expect(onSubmitAttempt).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('points the button at the error region so the reason is reachable on tab-back', () => {
        renderFooter({ blockedReason: SELECT_MAIN_FILE_MESSAGE })
        expect(screen.getByRole('button', { name: 'Resubmit code for review' })).toHaveAttribute(
            'aria-describedby',
            SUBMIT_CODE_ERROR_ID,
        )
    })

    it('does not open the modal when files are present but the note is empty', async () => {
        const user = userEvent.setup()
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], withNoteInput: true })

        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})

describe('EditStudyCodeFooter — confirmation modal', () => {
    it('opens the modal with the expected copy when Resubmit is clicked', async () => {
        const user = userEvent.setup()
        renderFooter({
            initialNote: wordsString(10),
            mainFileName: 'main.R',
            fileNames: ['main.R'],
        })
        await user.click(screen.getByRole('button', { name: 'Resubmit code for review' }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Resubmit your code for review?')
        expect(dialog).toHaveTextContent(
            `Your code will be sent to ${ORG_NAME} for review. If approved, it will run in the secure enclave. You will not be able to make changes after you submit.`,
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
})

describe('EditStudyCodeFooter — Previous step', () => {
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

    it('steps back when only files have been edited this session', async () => {
        const user = userEvent.setup()
        memoryRouter.setCurrentUrl('/start')
        renderFooter({ mainFileName: 'main.R', fileNames: ['main.R'], filesEdited: true })

        await user.click(screen.getByRole('button', { name: 'Previous step' }))

        await waitFor(() => expect(memoryRouter.asPath).toBe(EXIT_TARGET))
    })
})
