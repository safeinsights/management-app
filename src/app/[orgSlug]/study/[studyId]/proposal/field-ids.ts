import { editableTextFields } from './field-config'
import type { ProposalFormValues } from './schema'

/**
 * DOM ids of the Step 2 controls, and the form paths their errors are keyed by.
 *
 * The two are not interchangeable, and conflating them is how a "flag the first invalid field" jump
 * silently does nothing: `focusFirstInvalid` looks ids up with `getElementById`, while
 * `form.validate()` returns a map keyed by schema path. Same split as Step 1's `field-ids.ts`.
 */
export const DATASETS_FIELD_ID = 'datasets'
export const PI_SELECT_ID = 'piName'

/**
 * The Submit button, which the failed-submit path scrolls back into view. Not a field, so it is
 * deliberately outside {@link ORDERED_FIELD_IDS}: it is a scroll target, never a focus target for
 * the "jump to the first flagged field" rule.
 */
export const SUBMIT_BUTTON_ID = 'submit-proposal'

/** Matches the id `CollaborativeProposalTextField` puts on the editable surface. */
export const textFieldInputId = (id: keyof ProposalFormValues) => `proposal-field-${id}`

/**
 * Every focusable Step 2 field, in visual and DOM order. That ordering IS the "first" the card
 * promises the user, and nothing else recovers it: a Lexical contenteditable and a Mantine Select
 * share no common wrapper whose positions could be compared.
 *
 * Derived from `editableTextFields` rather than listed by hand so a field added to the page cannot
 * be left out of the jump order.
 */
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
