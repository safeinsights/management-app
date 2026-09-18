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
    userEvent,
    vi,
    waitFor,
} from '@/tests/unit.helpers'
import { type FC } from 'react'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { useForm } from '@/common'
import { fieldCounterId, fieldErrorId } from '@/components/form-field'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { CollaborativeProposalTextField, ProposalTextFieldEntry } from './collaborative-proposal-text-field'
import { editableTextFields, type EditableTextField } from './field-config'
import { textFieldInputId } from './field-ids'
import { initialProposalValues, type ProposalFormValues } from './schema'
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

// Selected on the property under test rather than by label, so renaming copy does not fail a test
// about ARIA.
const fieldWhere = (predicate: (field: EditableTextField) => boolean, description: string) => {
    const field = editableTextFields.find(predicate)
    if (!field) throw new Error(`no ${description} editable text field in the proposal config`)
    return field
}

const STUDY_ID = faker.string.uuid()

// Edits must go through Lexical's API: happy-dom cannot dispatch the `beforeinput` events the
// editor listens for.
const setEditorText = async (surface: HTMLElement, text: string) => {
    const editor = lexicalEditorFor(surface)
    // Awaited: Lexical commits on a microtask, so a synchronous act() returns before the change
    // has reached the form.
    await act(async () => {
        editor.update(() => {
            const paragraph = $createParagraphNode()
            if (text) paragraph.append($createTextNode(text))
            $getRoot().clear().append(paragraph)
        })
    })
}

// The entry bound to a real form, which is what owns the error the field displays. One harness for
// both editor modes: the provider is null in single-user mode, where the Editor ignores it anyway.
const EntryHarness: FC<{
    field: EditableTextField
    initialValue?: string
    initialErrors?: Record<string, string>
}> = ({ field, initialValue = '', initialErrors }) => {
    const form = useForm<ProposalFormValues>({
        initialValues: { ...initialProposalValues, [field.id]: initialValue },
        initialErrors,
    })
    const websocketProvider = useYjsWebsocket()

    return <ProposalTextFieldEntry field={field} form={form} studyId={STUDY_ID} websocketProvider={websocketProvider} />
}

// OTTER-647: ariaRequired was passed bare while the asterisk followed field.required, so the one
// optional field announced as required.
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

// OTTER-737: the count must be reachable from the field, and the over-limit message must announce
// itself because it can appear with the caret still in the box.
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
    it('reports the save while an optional field holds text, then drops the label once it is emptied', async () => {
        const field = fieldWhere((f) => !f.required, 'optional')
        renderCollaborativeField(field)

        const surface = await screen.findByLabelText(field.label)

        await setEditorText(surface, 'a note for the data partner')
        await simulateEditorSave()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)

        // A save lands while the box is empty, so the label is suppressed rather than merely stale.
        await setEditorText(surface, '')
        await simulateEditorSave()
        expect(screen.queryByTestId('autosave-status')).toBeNull()
    })
})

// Focusing an empty Lexical root appends a paragraph, which the editor reports as a change. Submit
// focuses the first flagged field right after raising its error, so without this guard the error
// would vanish the moment it appeared (OTTER-762).
describe('ProposalTextFieldEntry focus on an empty field', () => {
    const field = fieldWhere((f) => !!f.required, 'required')
    const REQUIRED_ERROR = 'Enter your research questions before continuing.'

    const Harness = () => <EntryHarness field={field} initialErrors={{ [field.id]: REQUIRED_ERROR }} />

    it('keeps a required error when focus lands on the still-empty editor', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />, { singleUserEditing: true })

        await user.click(await screen.findByLabelText(field.label))

        expect(screen.getByText(REQUIRED_ERROR)).toBeInTheDocument()
    })

    it('clears the error as soon as the researcher types', async () => {
        const user = userEvent.setup()
        renderWithProviders(<Harness />, { singleUserEditing: true })

        await user.click(await screen.findByLabelText(field.label))
        await user.paste('A question?')

        await waitFor(() => expect(screen.queryByText(REQUIRED_ERROR)).not.toBeInTheDocument())
    })
})

// OTTER-777: the message used to be stored with setFieldError right after setFieldValue had queued
// a clear of the same field, so Mantine's dedupe dropped it on every other change, and on the
// no-op change a focus reports. Every test here drives more than one change for that reason.
describe('ProposalTextFieldEntry over-limit error', () => {
    const field = fieldWhere((f) => !!f.required, 'required')
    const OVER_LIMIT_ERROR = overCharacterLimitError(field.label, field.maxCharacters)
    const inputId = textFieldInputId(field.id)
    const overLimitText = (by: number) => 'x'.repeat(field.maxCharacters + by)

    const renderEntry = (initialValue: string) =>
        renderWithProviders(<EntryHarness field={field} initialValue={initialValue} />, { singleUserEditing: true })

    it('keeps the message through consecutive edits past the limit', async () => {
        renderEntry(lexicalJson('x'.repeat(field.maxCharacters)))

        const surface = await screen.findByLabelText(field.label)

        for (const by of [1, 2, 3]) {
            await setEditorText(surface, overLimitText(by))

            expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
            expect(surface).toHaveAttribute('aria-invalid', 'true')
        }
    })

    // What Submit does after it flags the field: focusing a Lexical surface changes the selection,
    // which the editor reports as an update even though the text is untouched.
    it('keeps the message when only the selection changes, as focus does', async () => {
        renderEntry(lexicalJson('x'.repeat(field.maxCharacters)))

        const surface = await screen.findByLabelText(field.label)
        await setEditorText(surface, overLimitText(1))
        expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()

        const editor = lexicalEditorFor(surface)
        await act(async () => {
            editor.update(() => {
                $getRoot().selectEnd()
            })
        })

        expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
        expect(surface).toHaveAttribute('aria-invalid', 'true')
        expect(surface.getAttribute('aria-describedby')).toContain(fieldErrorId(inputId))
    })

    it('drops the message once the text is back within the limit', async () => {
        renderEntry(lexicalJson('x'.repeat(field.maxCharacters)))

        const surface = await screen.findByLabelText(field.label)
        await setEditorText(surface, overLimitText(1))
        expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()

        await setEditorText(surface, 'x'.repeat(field.maxCharacters))

        await waitFor(() => expect(screen.queryByText(OVER_LIMIT_ERROR)).not.toBeInTheDocument())
        expect(surface).not.toHaveAttribute('aria-invalid')
    })

    // The pair the card reports: the error and the save label alternated, one per keystroke.
    it('never shows the save label while the field is over the limit', async () => {
        renderWithProviders(<EntryHarness field={field} initialValue={lexicalJson('a question')} />)

        const surface = await screen.findByLabelText(field.label)
        await simulateEditorSave()
        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)

        for (const by of [1, 2]) {
            await setEditorText(surface, overLimitText(by))
            await simulateEditorSave()

            expect(screen.getByText(OVER_LIMIT_ERROR)).toBeInTheDocument()
            expect(screen.queryByTestId('autosave-status')).toBeNull()
        }

        await setEditorText(surface, 'x'.repeat(field.maxCharacters))
        await simulateEditorSave()

        expect(screen.getByTestId('autosave-status')).toHaveTextContent(SAVED_LABEL)
    })
})

// OTTER-777: the error used to render in a second row under the editor's own footer, so the counter
// sat one row lower whenever the save label replaced the error. Asserted on what the error's row
// holds, because merely sharing an ancestor with the counter also passes while they are apart.
describe('CollaborativeProposalTextField footer row', () => {
    const field = fieldWhere((f) => !!f.required, 'required')
    const OVER_LIMIT_ERROR = overCharacterLimitError(field.label, field.maxCharacters)
    const inputId = textFieldInputId(field.id)

    const counter = () => document.getElementById(fieldCounterId(inputId))

    it('puts the error beside the counter, below the editor', async () => {
        renderField(field, { initialValue: lexicalJson('hi'), error: OVER_LIMIT_ERROR })

        const surface = await screen.findByLabelText(field.label)
        const errorBox = document.getElementById(fieldErrorId(inputId))!

        expect(errorBox).toHaveTextContent(OVER_LIMIT_ERROR)
        expect(errorBox.parentElement).toContainElement(counter())
        expect(errorBox.parentElement).not.toContainElement(surface)
    })

    it('puts the save label in that same row', async () => {
        renderCollaborativeField(field, { initialValue: lexicalJson('hi') })

        await screen.findByLabelText(field.label)
        await simulateEditorSave()

        const region = screen.getByTestId('autosave-live-region')
        expect(region).toContainElement(screen.getByTestId('autosave-status'))
        expect(region.parentElement).toContainElement(counter())
    })

    it('renders the message once, not in two rows', async () => {
        renderField(field, { initialValue: lexicalJson('hi'), error: OVER_LIMIT_ERROR })

        await screen.findByLabelText(field.label)

        expect(screen.getAllByText(OVER_LIMIT_ERROR)).toHaveLength(1)
    })
})
