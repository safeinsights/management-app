/**
 * DOM ids of the Step 1 controls, and the form paths their errors are keyed by.
 *
 * The two are not interchangeable, and conflating them is how a "flag the first invalid field"
 * jump silently does nothing: `focusFirstInvalid` looks ids up with `getElementById`, while
 * `form.validate()` returns a map keyed by schema path.
 */
export const TITLE_INPUT_ID = 'title'
export const ORG_SELECT_ID = 'studyOrg'
/**
 * A wrapper around the radio group, not the group itself: Mantine consumes `Radio.Group`'s `id`
 * to derive its internal associations and never renders it, so `getElementById` finds nothing.
 * The group keeps its own id; this one is only the focus target.
 */
export const LANGUAGE_FIELD_ID = 'programming-language-field'

export const FIELD_ID_TO_FORM_PATH = {
    [TITLE_INPUT_ID]: 'title',
    [ORG_SELECT_ID]: 'orgSlug',
    [LANGUAGE_FIELD_ID]: 'language',
} as const
