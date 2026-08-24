import { describe, expect, it } from 'vitest'
import { render, renderWithProviders, screen } from '@/tests/unit.helpers'
import { MantineProvider } from '@mantine/core'
import { ModalsProvider } from '@mantine/modals'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { fieldErrorId } from '@/components/form-field'
import { theme } from '@/theme'
import { useForm, zodResolver } from '@/common'
import {
    RESUBMIT_NOTE_MAX_CHARACTERS,
    initialResubmitNoteValue,
    resubmissionNoteToLexicalJson,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { CollaborativeResubmissionNoteSection } from './collaborative-resubmission-note-section'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function Harness({ initialNote = '', initialError }: { initialNote?: string; initialError?: string }) {
    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: {
            ...initialResubmitNoteValue,
            resubmissionNote: resubmissionNoteToLexicalJson(initialNote),
        },
        // `initialErrors` rather than assigning to `form.errors`, which Mantine exposes as read-only.
        initialErrors: initialError ? { resubmissionNote: initialError } : {},
        validateInputOnChange: true,
    })

    // lastSavedAt is non-null so the saved indicator WOULD render were it not
    // for the collaborative-mode gate — keeps the absence assertion meaningful.
    const savedAutosaveStatus = { isSaving: false, lastSavedAt: new Date('2026-05-20T10:15:00Z') }

    // With a null websocketProvider the Editor renders its skeleton — as far as
    // jsdom can take a Yjs editor; live behavior is covered by e2e.
    return (
        <CollaborativeResubmissionNoteSection
            studyId={STUDY_ID}
            noteVersion={2}
            noteForm={noteForm}
            orgName="Rice University"
            initialNote={initialNote}
            websocketProvider={null}
            autosaveStatus={savedAutosaveStatus}
        />
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
        // The error must empty the region rather than unmount it: a region handed back with its
        // text already inside is silent in most AT/browser pairs.
        renderSingleUserSection({ initialError: 'A resubmission note is required.' })
        expect(screen.getByTestId('autosave-live-region')).toBeEmptyDOMElement()
    })

    it('mounts no live region at all in collaborative mode, where the editor owns one', () => {
        renderSection()
        expect(screen.queryByTestId('autosave-live-region')).not.toBeInTheDocument()
    })
})
