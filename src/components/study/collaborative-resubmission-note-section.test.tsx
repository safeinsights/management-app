import { describe, expect, it } from 'vitest'
import { render, renderWithProviders, screen, userEvent, waitFor } from '@/tests/unit.helpers'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { fieldErrorId } from '@/components/form-field'
import { theme } from '@/theme'
import { useForm, zodResolver } from '@/common'
import {
    PROPOSAL_REQUIRED_NOTE_ERROR,
    RESUBMIT_NOTE_MAX_CHARACTERS,
    initialResubmitNoteValue,
    proposalResubmitNoteSchema,
    resubmissionNoteToLexicalJson,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { CollaborativeResubmissionNoteSection } from './collaborative-resubmission-note-section'
import { overCharacterLimitError } from '@/lib/field-limits'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

// Mirrors EditResubmitProvider: no validateInputOnChange, so the section itself owns the live
// over-limit rule (OTTER-762).
function Harness({ initialNote = '', initialError }: { initialNote?: string; initialError?: string }) {
    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(proposalResubmitNoteSchema),
        initialValues: {
            ...initialResubmitNoteValue,
            resubmissionNote: resubmissionNoteToLexicalJson(initialNote),
        },
        // `initialErrors` rather than assigning to `form.errors`, which Mantine exposes as read-only.
        initialErrors: initialError ? { resubmissionNote: initialError } : {},
    })

    // lastSavedAt is non-null so the saved indicator WOULD render were it not for the
    // collaborative-mode gate, which keeps the absence assertion meaningful.
    const savedAutosaveStatus = { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') }

    return (
        <>
            <CollaborativeResubmissionNoteSection
                studyId={STUDY_ID}
                noteVersion={2}
                noteForm={noteForm}
                orgName="Rice University"
                initialNote={initialNote}
                websocketProvider={null}
                autosaveStatus={savedAutosaveStatus}
            />
            {/* The editor reports a blur only when focus lands outside the whole widget, so the
                test needs somewhere else to put it. */}
            <button type="button">Elsewhere</button>
        </>
    )
}

const renderSection = (props: Partial<React.ComponentProps<typeof Harness>> = {}) =>
    renderWithProviders(<Harness {...props} />)

// renderWithProviders hard-codes collaborative mode; single-user mode needs its own provider tree.
const renderSingleUserSection = (props: Partial<React.ComponentProps<typeof Harness>> = {}) =>
    render(
        <MantineProvider theme={theme}>
            <YjsWebsocketProvider singleUserEditing>
                <ModalsProvider>
                    <Harness {...props} />
                </ModalsProvider>
            </YjsWebsocketProvider>
        </MantineProvider>,
    )

describe('CollaborativeResubmissionNoteSection', () => {
    it('renders the section title with the required indicator', () => {
        renderSection()
        expect(screen.getByRole('heading', { name: /Resubmission Note/ })).toBeInTheDocument()
        expect(screen.getByLabelText('required')).toBeInTheDocument()
    })

    it('names the data partner in the guidance copy', () => {
        renderSection()
        expect(screen.getByText(/feedback from Rice University/)).toBeInTheDocument()
    })

    it('does not render the section-level autosave indicator in collaborative mode', () => {
        renderSection()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('renders the section-level autosave indicator in single-user mode once a draft has been saved', () => {
        renderSingleUserSection()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent('All changes saved')
    })

    it('hides the autosave indicator while a validation error is showing (OTTER-674)', () => {
        renderSingleUserSection({ initialError: 'A resubmission note is required.' })
        expect(screen.getByText('A resubmission note is required.')).toBeInTheDocument()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('renders the error in the same footer row as the character counter (OTTER-674)', () => {
        renderSingleUserSection({ initialError: 'A resubmission note is required.' })
        const errorBox = document.getElementById(fieldErrorId('resubmissionNote'))
        expect(errorBox).toHaveTextContent('A resubmission note is required.')
        expect(errorBox?.parentElement).toContainElement(screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`))
    })

    it('renders the single-user autosave indicator in the same footer row as the character counter', () => {
        renderSingleUserSection()
        const region = screen.getByTestId('autosave-live-region')
        expect(region).toContainElement(screen.getByTestId('autosave-status'))
        expect(region.parentElement).toContainElement(screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`))
    })

    it('keeps the live region mounted through a validation error, so a later save is announced (OTTER-675)', () => {
        renderSingleUserSection({ initialError: 'A resubmission note is required.' })
        expect(screen.getByTestId('autosave-live-region')).toBeEmptyDOMElement()
    })

    it('mounts no live region at all in collaborative mode, where the editor owns one', () => {
        renderSection()
        expect(screen.queryByTestId('autosave-live-region')).not.toBeInTheDocument()
    })
})

describe('CollaborativeResubmissionNoteSection character limit', () => {
    const OVER_LIMIT_ERROR = overCharacterLimitError('Resubmission note', RESUBMIT_NOTE_MAX_CHARACTERS)

    it('seeds the counter from the draft, excluding whitespace at its ends', () => {
        renderSingleUserSection({ initialNote: '  hello  ' })
        expect(screen.getByText(`5/${RESUBMIT_NOTE_MAX_CHARACTERS}`)).toBeInTheDocument()
    })

    it('names the counter in the editor aria-describedby', async () => {
        renderSingleUserSection()
        const editor = await screen.findByLabelText('Resubmission Note')
        const counter = screen.getByText(`0/${RESUBMIT_NOTE_MAX_CHARACTERS}`)
        expect(editor.getAttribute('aria-describedby')).toContain(counter.id)
    })

    it('announces the over-limit message politely', () => {
        renderSingleUserSection({ initialError: OVER_LIMIT_ERROR })
        const message = screen.getByText(OVER_LIMIT_ERROR)
        expect(message.closest('[aria-live="polite"]')).not.toBeNull()
    })

    // The form no longer validates per keystroke (OTTER-762), so the section has to raise this
    // one itself while the caret is still in the field.
    it('raises the over-limit message while typing, before focus leaves the field', async () => {
        const user = userEvent.setup()
        renderSingleUserSection()

        const editor = await screen.findByLabelText('Resubmission Note')
        await user.click(editor)
        await user.paste('x'.repeat(RESUBMIT_NOTE_MAX_CHARACTERS + 1))

        expect(await screen.findByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
    })
})

describe('CollaborativeResubmissionNoteSection placeholder and required rule (OTTER-762)', () => {
    it('renders no placeholder text', async () => {
        renderSingleUserSection()

        await screen.findByLabelText('Resubmission Note')
        expect(screen.queryByText(/Summarize the modifications made to your initial request/)).not.toBeInTheDocument()
    })

    it('does not flag an empty note until focus leaves the field', async () => {
        const user = userEvent.setup()
        renderSingleUserSection()

        const editor = await screen.findByLabelText('Resubmission Note')
        await user.click(editor)
        expect(screen.queryByText(PROPOSAL_REQUIRED_NOTE_ERROR)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Elsewhere' }))

        await waitFor(() => expect(screen.getByText(PROPOSAL_REQUIRED_NOTE_ERROR)).toBeInTheDocument())
    })

    // Focusing an empty Lexical root appends a paragraph, which the editor reports as a change.
    // Resubmit focuses the flagged note right after raising the error, so this is the path that
    // would otherwise wipe the error the moment it appears.
    it('keeps a required error when focus lands on the still-empty editor', async () => {
        const user = userEvent.setup()
        renderSingleUserSection({ initialError: PROPOSAL_REQUIRED_NOTE_ERROR })

        const editor = await screen.findByLabelText('Resubmission Note')
        await user.click(editor)

        expect(screen.getByText(PROPOSAL_REQUIRED_NOTE_ERROR)).toBeInTheDocument()
    })

    it('clears a required error as soon as the researcher types', async () => {
        const user = userEvent.setup()
        renderSingleUserSection({ initialError: PROPOSAL_REQUIRED_NOTE_ERROR })
        expect(screen.getByText(PROPOSAL_REQUIRED_NOTE_ERROR)).toBeInTheDocument()

        const editor = await screen.findByLabelText('Resubmission Note')
        await user.click(editor)
        await user.paste('Addressed the feedback.')

        await waitFor(() => expect(screen.queryByText(PROPOSAL_REQUIRED_NOTE_ERROR)).not.toBeInTheDocument())
    })
})
