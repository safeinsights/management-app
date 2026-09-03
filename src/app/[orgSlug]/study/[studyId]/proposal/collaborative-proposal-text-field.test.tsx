import { describe, expect, faker, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { CollaborativeProposalTextField } from './collaborative-proposal-text-field'
import { editableTextFields, type EditableTextField } from './field-config'
import { lexicalJson } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

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

// Selected on the property under test rather than by label, so renaming copy does not fail a test
// about ARIA.
const fieldWhere = (predicate: (field: EditableTextField) => boolean, description: string) => {
    const field = editableTextFields.find(predicate)
    if (!field) throw new Error(`no ${description} editable text field in the proposal config`)
    return field
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
