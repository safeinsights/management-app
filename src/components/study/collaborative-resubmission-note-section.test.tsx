import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/tests/unit.helpers'
import { useForm, zodResolver } from '@/common'
import {
    initialResubmitNoteValue,
    resubmissionNoteToLexicalJson,
    resubmitNoteSchema,
    type ResubmitNoteValue,
} from '@/app/[orgSlug]/study/[studyId]/edit-and-resubmit/schema'
import { CollaborativeResubmissionNoteSection } from './collaborative-resubmission-note-section'

const STUDY_ID = '11111111-1111-4111-8111-111111111111'

function Harness({ initialNote = '' }: { initialNote?: string }) {
    const noteForm = useForm<ResubmitNoteValue>({
        validate: zodResolver(resubmitNoteSchema),
        initialValues: {
            ...initialResubmitNoteValue,
            resubmissionNote: resubmissionNoteToLexicalJson(initialNote),
        },
        validateInputOnChange: true,
    })

    // websocketProvider stays null (SSR/pre-hydration shape): the Editor renders
    // its skeleton, which is as far as jsdom can take a Yjs-backed editor. The
    // live collaborative behavior is covered by the e2e study flow.
    return (
        <CollaborativeResubmissionNoteSection
            studyId={STUDY_ID}
            noteVersion={2}
            noteForm={noteForm}
            orgName="Rice University"
            initialNote={initialNote}
            websocketProvider={null}
            autosaveStatus={{ isSaving: false, lastSavedAt: null }}
        />
    )
}

const renderSection = (props: Partial<React.ComponentProps<typeof Harness>> = {}) =>
    renderWithProviders(<Harness {...props} />)

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

    it('does not render the plain-textarea autosave indicator in collaborative mode', () => {
        // The collaborative editor surfaces its own provider-driven save status;
        // a second section-level indicator is exactly the duplication OTTER-658
        // flagged. Default test context is collaborative (singleUserEditing=false).
        renderSection()
        expect(screen.queryByTestId('autosave-status')).not.toBeInTheDocument()
    })

    it('does not render a plain textarea — the note is an editor surface now', () => {
        renderSection()
        expect(screen.queryByRole('textbox', { name: 'Resubmission Note' })).not.toBeInTheDocument()
    })
})
