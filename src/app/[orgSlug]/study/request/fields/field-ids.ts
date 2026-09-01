// DOM ids and form paths are not interchangeable: focusFirstInvalid uses getElementById while
// form.validate() keys by schema path, so conflating them makes the jump silently do nothing.
export const TITLE_INPUT_ID = 'title'
export const ORG_SELECT_ID = 'studyOrg'
// A wrapper, not the group itself: Mantine consumes Radio.Group's id internally and never
// renders it, so getElementById would find nothing.
export const LANGUAGE_FIELD_ID = 'programming-language-field'

export const FIELD_ID_TO_FORM_PATH = {
    [TITLE_INPUT_ID]: 'title',
    [ORG_SELECT_ID]: 'orgSlug',
    [LANGUAGE_FIELD_ID]: 'language',
} as const
