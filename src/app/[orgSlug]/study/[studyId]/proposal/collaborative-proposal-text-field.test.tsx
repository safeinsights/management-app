import { MantineProvider } from '@mantine/core'
import { describe, expect, faker, it, render, screen, vi } from '@/tests/unit.helpers'
import { YjsWebsocketProvider } from '@/lib/realtime/yjs-websocket-context'
import { theme } from '@/theme'
import type { ProposalTextFieldKey } from '@/lib/collaboration-documents'
import { CollaborativeProposalTextField } from './collaborative-proposal-text-field'
import { editableTextFields, type EditableTextField } from './field-config'

// singleUserEditing renders the standalone Lexical surface, so the editable node is in the DOM
// here instead of held behind the collaborative skeleton (which needs a live websocket).
const renderField = (field: EditableTextField) =>
    render(
        <MantineProvider theme={theme}>
            <YjsWebsocketProvider singleUserEditing>
                <CollaborativeProposalTextField
                    studyId={faker.string.uuid()}
                    field={field as EditableTextField & { id: ProposalTextFieldKey }}
                    initialValue=""
                    error={undefined}
                    onChange={vi.fn()}
                    onBlur={vi.fn()}
                    websocketProvider={null}
                />
            </YjsWebsocketProvider>
        </MantineProvider>,
    )

const fieldNamed = (label: string) => {
    const field = editableTextFields.find((f) => f.label === label)
    if (!field) throw new Error(`no editable text field labelled ${label}`)
    return field
}

// OTTER-647: `ariaRequired` was passed bare while the asterisk correctly followed
// `field.required`, so the one optional field announced as required to a screen reader.
describe('CollaborativeProposalTextField required state', () => {
    it('marks a required field required for assistive tech', async () => {
        const field = fieldNamed('Research question(s)')
        renderField(field)

        expect(await screen.findByLabelText(field.label)).toHaveAttribute('aria-required', 'true')
    })

    it('leaves an optional field unmarked', async () => {
        const field = fieldNamed('Additional notes or requests')
        renderField(field)

        expect(await screen.findByLabelText(field.label)).not.toHaveAttribute('aria-required', 'true')
    })
})
