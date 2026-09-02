import {
    act,
    describe,
    expect,
    faker,
    it,
    lexicalEditorFor,
    renderWithProviders,
    screen,
    simulateEditorSave,
    vi,
} from '@/tests/unit.helpers'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { CollaborativeProposalTextField } from './collaborative-proposal-text-field'
import { editableTextFields, type EditableTextField } from './field-config'
import { lexicalJson } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'
import { SAVED_LABEL } from '@/components/save-status'
import { useYjsWebsocket } from '@/lib/realtime/yjs-websocket-context'

const renderField = (field: EditableTextField, { initialValue = '', error }: RenderOptions = {}) =>
    renderWithProviders(
        <CollaborativeProposalTextField
            studyId={faker.string.uuid()}
            field={field as EditableTextField & { id: ProposalTextFieldKey }}
            initialValue={initialValue}
            error={error}
            onChange={vi.fn()}
            onBlur={vi.fn()}
            websocketProvider={null}
        />,
        { singleUserEditing: true },
    )

type RenderOptions = { initialValue?: string; error?: string }

// The collaborative branch, the only one that draws a save indicator. Takes the socket from the
// context so the editor sees a connected phase and renders past its skeleton.
const renderCollaborativeField = (field: EditableTextField, { initialValue = '', error }: RenderOptions = {}) => {
    const Field = () => (
        <CollaborativeProposalTextField
            studyId={faker.string.uuid()}
            field={field as EditableTextField & { id: ProposalTextFieldKey }}
            initialValue={initialValue}
            error={error}
            onChange={vi.fn()}
            onBlur={vi.fn()}
            websocketProvider={useYjsWebsocket()}
        />
    )

    return renderWithProviders(<Field />)
}

// Selected on the property under test rather than by label, so renaming the copy does not fail a
// test about ARIA. The throw keeps the failure legible if the config ever loses one of the two.
const fieldWhere = (predicate: (field: EditableTextField) => boolean, description: string) => {
    const field = editableTextFields.find(predicate)
    if (!field) throw new Error(`no ${description} editable text field in the proposal config`)
    return field
}

// OTTER-647: `ariaRequired` was passed bare while the asterisk correctly followed
// `field.required`, so the one optional field announced as required to a screen reader.
describe('CollaborativeProposalTextField required state', () => {
    it('marks a required field required for assistive tech', async () => {
        const field = fieldWhere((f) => !!f.required, 'required')
        renderField(field)

        expect(await screen.findByLabelText(field.label)).toHaveAttribute('aria-required', 'true')
    })

    it('leaves an optional field unmarked', async () => {
        const field = fieldWhere((f) => !f.required, 'optional')
        renderField(field)

        expect(await screen.findByLabelText(field.label)).not.toHaveAttribute('aria-required', 'true')
    })
})

// OTTER-737: the count has to be reachable from the field, not merely visible beside it, and the
// over-limit message has to announce itself because it can appear with the caret still in the box.
describe('CollaborativeProposalTextField character counter', () => {
    it('seeds the counter from the initial value, excluding whitespace at its ends', async () => {
        const field = fieldWhere((f) => !!f.required, 'required')
        renderField(field, { initialValue: lexicalJson('  hello  ') })

        expect(await screen.findByText(`5/${field.maxCharacters}`)).toBeInTheDocument()
    })

    it('names the counter in the editor aria-describedby', async () => {
        const field = fieldWhere((f) => !!f.required, 'required')
        renderField(field, { initialValue: lexicalJson('hi') })

        const editor = await screen.findByLabelText(field.label)
        const counter = screen.getByText(`2/${field.maxCharacters}`)
        expect(editor.getAttribute('aria-describedby')).toContain(counter.id)
    })

    it('announces the over-limit message politely', async () => {
        const field = fieldWhere((f) => !!f.required, 'required')
        const message = overCharacterLimitError(field.label, field.maxCharacters)
        renderField(field, { initialValue: lexicalJson('hi'), error: message })

        const rendered = await screen.findByText(message)
        expect(rendered.closest('[aria-live="polite"]')).not.toBeNull()
    })
})

// An emptied required field raises an error that takes the label's slot; an optional one never
// does, so it needs a rule of its own or the label sits alone under an empty box.
describe('CollaborativeProposalTextField save status', () => {
    it('reports the save on an optional field that still holds text', async () => {
        const field = fieldWhere((f) => !f.required, 'optional')
        renderCollaborativeField(field, { initialValue: lexicalJson('a note for the data partner') })

        await screen.findByLabelText(field.label)
        await simulateEditorSave()

        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)
    })

    it('drops the save label once an optional field is emptied', async () => {
        const field = fieldWhere((f) => !f.required, 'optional')
        renderCollaborativeField(field)

        await screen.findByLabelText(field.label)
        await simulateEditorSave()

        expect(screen.queryByTestId('autosave-status')).toBeNull()
    })

    // The boundary of the rule above: a required field reports the save until its error replaces it.
    it('keeps reporting the save on an emptied required field with no error yet', async () => {
        const field = fieldWhere((f) => !!f.required, 'required')
        renderCollaborativeField(field)

        await screen.findByLabelText(field.label)
        await simulateEditorSave()

        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)
    })
})

// The tests above start at their end state, pinning the rule against the seeded count. This pins it
// against the count following real edits, which is what decides the outcome mid-session.
describe('CollaborativeProposalTextField save status through an edit', () => {
    const setEditorText = (surface: HTMLElement, text: string) => {
        const editor = lexicalEditorFor(surface)
        act(() => {
            editor.update(() => {
                const paragraph = $createParagraphNode()
                if (text) paragraph.append($createTextNode(text))
                $getRoot().clear().append(paragraph)
            })
        })
    }

    it('reports the save while an optional field holds text, then drops the label once it is emptied', async () => {
        const field = fieldWhere((f) => !f.required, 'optional')
        renderCollaborativeField(field)

        const surface = await screen.findByLabelText(field.label)

        setEditorText(surface, 'a note for the data partner')
        await simulateEditorSave()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)

        // A save lands while the box is empty, so the label is suppressed rather than merely stale.
        setEditorText(surface, '')
        await simulateEditorSave()
        expect(screen.queryByTestId('autosave-status')).toBeNull()
    })
})
