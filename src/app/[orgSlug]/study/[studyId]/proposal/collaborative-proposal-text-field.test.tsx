import { describe, expect, faker, it, renderWithProviders, screen, vi } from '@/tests/unit.helpers'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { CollaborativeProposalTextField } from './collaborative-proposal-text-field'
import { editableTextFields, type EditableTextField } from './field-config'

const renderField = (field: EditableTextField) =>
    renderWithProviders(
        <CollaborativeProposalTextField
            studyId={faker.string.uuid()}
            field={field as EditableTextField & { id: ProposalTextFieldKey }}
            initialValue=""
            error={undefined}
            onChange={vi.fn()}
            onBlur={vi.fn()}
            websocketProvider={null}
        />,
        { singleUserEditing: true },
    )

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
