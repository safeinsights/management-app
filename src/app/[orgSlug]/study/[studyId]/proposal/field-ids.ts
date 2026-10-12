import { editableTextFields } from './field-config'
import type { ProposalFormValues } from './schema'

// DOM ids and form paths are not interchangeable: focusFirstInvalid uses getElementById while
// form.validate() keys by schema path, so conflating them makes the jump silently do nothing.
export const DATASETS_FIELD_ID = 'datasets'
export const PI_SELECT_ID = 'piName'

// A scroll target, never a focus target, so it stays outside ORDERED_FIELD_IDS.
export const SUBMIT_BUTTON_ID = 'submit-proposal'

export const textFieldInputId = (id: keyof ProposalFormValues) => `proposal-field-${id}`

// This ordering defines "first invalid": a Lexical contenteditable and a Mantine Select share no
// wrapper whose positions could be compared.
export const ORDERED_FIELD_IDS: string[] = [
    DATASETS_FIELD_ID,
    ...editableTextFields.map((field) => textFieldInputId(field.id)),
    PI_SELECT_ID,
]

export const FIELD_ID_TO_FORM_PATH: Record<string, keyof ProposalFormValues> = {
    [DATASETS_FIELD_ID]: 'datasets',
    ...Object.fromEntries(editableTextFields.map((field) => [textFieldInputId(field.id), field.id])),
    [PI_SELECT_ID]: 'piName',
}
