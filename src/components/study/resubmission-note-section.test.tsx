import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import {
    RESUBMIT_NOTE_MAX_CHARACTERS,
    initialResubmitNoteValue,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { ResubmissionNoteSection, type ResubmissionNoteAutosaveStatus } from './resubmission-note-section'
import { overCharacterLimitError } from '@/lib/field-limits'

const OVER_LIMIT_ERROR = overCharacterLimitError('Resubmission note', RESUBMIT_NOTE_MAX_CHARACTERS)

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
    it('renders the section title and the data partner name in the secondary text', () => {
        renderSection()
        expect(screen.getByRole('heading', { name: /Resubmission Note/ })).toBeInTheDocument()
        expect(screen.getByText(/Rice University/)).toBeInTheDocument()
    })

    it('renders the resubmission note title only once (no duplicate field label)', () => {
        renderSection()
        expect(screen.getAllByRole('heading', { name: /Resubmission Note/ })).toHaveLength(1)
    })

    it('renders the placeholder guidance copy on the textarea', () => {
        renderSection()
        expect(screen.getByRole('textbox', { name: 'Resubmission Note' })).toHaveAttribute(
            'placeholder',
            'Ex. Summarize the modifications made to your submitted code, including specific sections revised, issues identified by the reviewer that have been addressed, and the rationale behind your resubmission.',
        )
    })

    it('renders a 0/1800 character counter when empty', () => {
        renderSection()
        expect(screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    it('does not surface a validation error on first paint, before the user interacts', () => {
        renderSection()
        expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/character limit/i)).not.toBeInTheDocument()
    })

    it('updates the character counter live as the user types', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.type(textarea, 'one two three')
        expect(screen.getByText(`13/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    it('shows a validation error when the note is empty and the field is blurred', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.tab()
        expect(screen.getByText(/resubmission note is required/i)).toBeInTheDocument()
    })

    it('accepts a single character without surfacing a range error', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('x')
        expect(screen.queryByText(/resubmission note is required/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/character limit/i)).not.toBeInTheDocument()
    })

    it('counts characters beside the field and turns the counter red past the cap', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))

        // Mantine's `c` prop resolves to an inline color, not a class name.
        const counter = screen.getByText(`${RESUBMIT_NOTE_MAX_CHARACTERS + 1}/${RESUBMIT_NOTE_MAX_CHARACTERS}`)
        expect(counter.style.color).toContain('red')
    })

    it('raises the over-limit error naming the field and the cap', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))
        await user.tab()

        expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
    })

    // The form validates on change, so the message arrives with the caret still in the field
    // and nothing else would say so (OTTER-737).
    it('raises the over-limit error while typing and announces it politely', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))

        const message = screen.getByText(OVER_LIMIT_ERROR)
        expect(message.closest('[aria-live="polite"]')).not.toBeNull()
    })

    it('clears the over-limit error as soon as the note is back within the cap', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))
        expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()

        await user.type(textarea, '{backspace}')

        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
        expect(screen.getByText(`${RESUBMIT_NOTE_MAX_CHARACTERS}/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    it('excludes whitespace at either end from the counter and from validation', async () => {
        const user = userEvent.setup()
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        await user.click(textarea)
        await user.paste(`  ${'x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS)}  `)

        expect(screen.getByText(`${RESUBMIT_NOTE_MAX_CHARACTERS}/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
    })

    it('names the counter in the textarea aria-describedby', () => {
        renderSection()
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })
        const counter = screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`)

        expect(textarea.getAttribute('aria-describedby')).toContain(counter.id)
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
        const status = screen.getByTestId('autosave-status')
        expect(status).toHaveTextContent('All changes saved')
        expect(status).not.toHaveTextContent(/\d/)
    })

    it('renders exactly one check icon in the saved state (OTTER-658)', () => {
        renderSection({ autosaveStatus: { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') } })
        const section = screen.getByTestId('resubmission-note-section')
        expect(section.querySelectorAll('svg')).toHaveLength(1)
    })

    it('replaces "All changes saved" with the error once the note is emptied (OTTER-674)', async () => {
        const user = userEvent.setup()
        renderSection({ autosaveStatus: { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') } })
        const textarea = screen.getByRole('textbox', { name: 'Resubmission Note' })

        await user.type(textarea, 'some draft text')
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('All changes saved')

        await user.clear(textarea)
        expect(screen.getByText(/resubmission note is required/i)).toBeInTheDocument()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('keeps the live region out of the textarea description (OTTER-675)', () => {
        // A live region inside the error node would fold "All changes saved" into the field's
        // description and re-read it on every refocus.
        renderSection({ autosaveStatus: { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') } })
        const errorNode = document.getElementById('resubmissionNote-error')
        expect(errorNode).toBeInTheDocument()
        expect(errorNode!.querySelector('[aria-live]')).toBeNull()
    })
})
