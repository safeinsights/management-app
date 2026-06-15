import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import {
    RESUBMIT_NOTE_MIN_WORDS,
    initialResubmitNoteValue,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { ResubmissionNoteSection, type ResubmissionNoteAutosaveStatus } from './resubmission-note-section'

const wordsString = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(' ')

function Harness({
    initialNote = '',
    autosaveStatus,
}: {
    initialNote?: string
    autosaveStatus?: ResubmissionNoteAutosaveStatus
}) {
    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: { ...initialResubmitNoteValue, resubmissionNote: initialNote },
        validateInputOnChange: true,
    })
    return <ResubmissionNoteSection noteForm={noteForm} orgName="Rice University" autosaveStatus={autosaveStatus} />
}

const renderSection = (props: Partial<React.ComponentProps<typeof Harness>> = {}) =>
    renderWithProviders(<Harness {...props} />)

describe('ResubmissionNoteSection', () => {
    it('renders the section title and the data org name in the secondary text', () => {
        renderSection()
        expect(screen.getByRole('heading', { name: 'Resubmission Note' })).toBeInTheDocument()
        expect(screen.getByText(/Rice University/)).toBeInTheDocument()
    })

    it('renders the placeholder guidance copy on the textarea', () => {
        renderSection()
        expect(screen.getByRole('textbox', { name: 'Resubmission Note' })).toHaveAttribute(
            'placeholder',
            'Ex. Summarize the modifications made to your submitted code, including specific sections revised, issues identified by the reviewer that have been addressed, and the rationale behind your resubmission.',
        )
    })

    it('renders a 0/300 word counter when empty', () => {
        renderSection()
        expect(screen.getByText('0/300')).toBeInTheDocument()
    })

    it('does not surface a validation error on first paint, before the user interacts', () => {
        renderSection()
        expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/between 50 and 300 words/i)).not.toBeInTheDocument()
    })

    it('updates the word counter live as the user types', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.type(textarea, 'one two three')
        expect(screen.getByText('3/300')).toBeInTheDocument()
    })

    it('shows a validation error when the note is empty and the field is blurred', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.tab()
        expect(screen.getByText(/resubmission note is required/i)).toBeInTheDocument()
    })

    it('accepts a note at the minimum word count without surfacing a range error', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste(wordsString(RESUBMIT_NOTE_MIN_WORDS))
        expect(screen.queryByText(/resubmission note is required/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/words or fewer/i)).not.toBeInTheDocument()
    })

    it('initialises the textarea with the supplied initial note', () => {
        renderSection({ initialNote: 'a pre-existing draft note' })
        expect(screen.getByRole('textbox', { name: 'Resubmission Note' })).toHaveValue('a pre-existing draft note')
    })

    it('does not render the autosave indicator when no autosaveStatus is provided', () => {
        renderSection()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('renders "Saving…" while autosave is in flight', () => {
        renderSection({ autosaveStatus: { isSaving: true, lastSavedAt: null } })
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('Saving…')
    })

    it('renders the "All changes saved" label once a draft has been saved', () => {
        renderSection({ autosaveStatus: { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') } })
        expect(screen.getByTestId('autosave-status')).toHaveTextContent(/All changes saved at \d{1,2}:\d{2} (AM|PM)/)
    })
})
