import { useField } from '@mantine/form'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { countCharactersFromLexical, hasLexicalContent } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

const OVER_LIMIT_ERROR = overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS)

const DEFAULT_EMPTY_ERROR = 'Feedback is required.'

// `useField` rather than plain state so an empty editor raises a visible error instead of silently
// disabling Submit (OTTER-647).
export function useReviewFeedback(emptyError: string = DEFAULT_EMPTY_ERROR) {
    // No `validateOnBlur`: Mantine reads it only from `getInputProps`, which this hook doesn't use.
    // The cap is not in `validate` either, since `useField` drops errors across a change.

    const field = useField<string>({
        initialValue: '',
        validate: (value) => (isBlank(value) ? emptyError : null),
    })

    const value = field.getValue()
    const characterCount = countCharactersFromLexical(value)
    const isOverLimit = characterCount > REVIEW_FEEDBACK_MAX_CHARACTERS

    // No useCallback: the React Compiler refuses to preserve a hand-memoized closure over `field`.
    const onChange = (json: string) => field.setValue(json)

    // Cast because Mantine types `field.error` as ReactNode, while this hook's `validate` only ever
    // returns strings and the editors narrow `error` to `string`.
    const error = isOverLimit ? OVER_LIMIT_ERROR : ((field.error as string | null) ?? null)

    return {
        value,
        onChange,
        onBlur: field.validate,
        error,
        characterCount,
        maxCharacters: REVIEW_FEEDBACK_MAX_CHARACTERS,
        isValid: !isBlank(value) && !isOverLimit,
    }
}

const isBlank = (value: string) => !hasLexicalContent(value)
