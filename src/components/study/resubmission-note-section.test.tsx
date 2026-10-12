import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import {
    REQUIRED_NOTE_ERROR,
    RESUBMIT_NOTE_MAX_CHARACTERS,
    initialResubmitNoteValue,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { ResubmissionNoteSection } from './resubmission-note-section'
import type { ResubmissionNoteAutosaveStatus } from './resubmission-note-card'
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
    })
    return (
        <>
            <ResubmissionNoteSection noteForm={noteForm} orgName="Rice University" autosaveStatus={autosaveStatus} />
            {/* Stands in for the footer's Resubmit, which validates the whole form on click. */}
            <button onClick={() => noteForm.validate()}>Resubmit probe</button>
            {/* The editor reports a blur only when focus lands outside the whole widget. */}
            <button type="button">Elsewhere</button>
        </>
    )
}

const clickResubmit = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: 'Resubmit probe' }))

const blur = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Elsewhere' }))

const renderSection = (props: Partial<React.ComponentProps<typeof Harness>> = {}) =>
    renderWithProviders(<Harness {...props} />)

const findEditor = () => screen.findByLabelText('Resubmission note')

describe('ResubmissionNoteSection', () => {
    it('renders the section title in sentence case and the data partner name (OTTER-778)', () => {
        renderSection()
        expect(screen.getByRole('heading', { name: /^Resubmission note/ })).toBeInTheDocument()
        expect(screen.getByText(/Rice University/)).toBeInTheDocument()
    })

    it('renders the rich-text toolbar (OTTER-778)', async () => {
        renderSection()
        await findEditor()
        expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    })

    it('renders a 0/1800 character counter when empty', () => {
        renderSection()
        expect(screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    it('does not surface a validation error on first paint, before the user interacts', () => {
        renderSection()
        expect(screen.queryByText(REQUIRED_NOTE_ERROR)).not.toBeInTheDocument()
        expect(screen.queryByText(/character limit/i)).not.toBeInTheDocument()
    })

    it('updates the character counter live as the user types', async () => {
        const user = userEvent.setup()
        renderSection()
        await user.click(await findEditor())
        await user.paste('one two three')
        expect(await screen.findByText(`13/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    // Only a Resubmit click raises the required error; blurring an empty note must leave it clean.
    it('does not raise the required error when an empty note is blurred', async () => {
        const user = userEvent.setup()
        renderSection()
        await user.click(await findEditor())
        await blur(user)
        expect(screen.queryByText(REQUIRED_NOTE_ERROR)).not.toBeInTheDocument()
    })

    it('raises the required error on a Resubmit click and clears it once the researcher types', async () => {
        const user = userEvent.setup()
        renderSection()

        await clickResubmit(user)
        expect(screen.getByText(REQUIRED_NOTE_ERROR)).toBeInTheDocument()

        await user.click(await findEditor())
        // Focusing the empty root is not an edit, so the error must survive it (OTTER-762).
        expect(screen.getByText(REQUIRED_NOTE_ERROR)).toBeInTheDocument()

        await user.paste('Addressed the feedback.')
        await waitFor(() => expect(screen.queryByText(REQUIRED_NOTE_ERROR)).not.toBeInTheDocument())
    })

    it('raises the over-limit error while typing and announces it politely', async () => {
        const user = userEvent.setup()
        renderSection()
        await user.click(await findEditor())
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))

        const message = await screen.findByText(OVER_LIMIT_ERROR)
        expect(message.closest('[aria-live="polite"]')).not.toBeNull()
    })

    it('keeps the over-limit error after blur', async () => {
        const user = userEvent.setup()
        renderSection()
        await user.click(await findEditor())
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))
        await blur(user)

        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
    })

    it('excludes whitespace at either end from the counter and from validation', async () => {
        renderSection({ initialNote: `  ${'x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS)}  ` })
        await findEditor()

        expect(screen.getByText(`${RESUBMIT_NOTE_MAX_CHARACTERS}/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
        expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument()
    })

    it('names the counter in the editor aria-describedby', async () => {
        renderSection()
        const editor = await findEditor()
        const counter = screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`)

        expect(editor.getAttribute('aria-describedby')).toContain(counter.id)
    })

    // Drafts saved before the editor became rich text are plain strings.
    it('seeds the editor from a plain-text draft', async () => {
        renderSection({ initialNote: 'a pre-existing draft note' })
        expect(await screen.findByText('a pre-existing draft note')).toBeInTheDocument()
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

    it('yields "All changes saved" to the error on a Resubmit click (OTTER-674)', async () => {
        const user = userEvent.setup()
        renderSection({ autosaveStatus: { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') } })
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('All changes saved')

        await clickResubmit(user)
        expect(screen.getByText(REQUIRED_NOTE_ERROR)).toBeInTheDocument()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('keeps the live region out of the editor description (OTTER-675)', () => {
        // A live region inside the error node would fold "All changes saved" into the field's
        // description and re-read it on every refocus.
        renderSection({ autosaveStatus: { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') } })
        const errorNode = document.getElementById('resubmissionNote-error')
        expect(errorNode).toBeInTheDocument()
        expect(errorNode!.querySelector('[aria-live]')).toBeNull()
    })
})
