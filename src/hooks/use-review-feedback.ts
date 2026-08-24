import { useField } from '@mantine/form'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { countCharactersFromLexical, extractTextFromLexical } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

const OVER_LIMIT_ERROR = overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS)

/**
 * Required reviewer feedback. Backed by `useField` rather than plain state so leaving the
 * editor without writing anything raises a visible error instead of silently disabling
 * Submit (OTTER-647). The `value` / `onChange` / `characterCount` / `isValid` surface is
 * unchanged for the Yjs-backed editor and the review mutation hooks.
 *
 * Emptiness is measured trimmed and so is the cap, through `countCharactersFromLexical`, so the
 * counter beside the field and the rule that gates it agree (OTTER-737).
 */
export function useReviewFeedback() {
    // No `validateOnBlur`: see the note in `use-review-decision`. This hook exposes `onBlur`
    // rather than spreading `getInputProps`, which is the only place Mantine reads that option.
    //
    // The cap is deliberately NOT part of `validate`. `useField` neither validates on change nor
    // keeps an error across one (its `clearErrorOnChange` is on by default), so a rule that only
    // runs on blur would leave the field silent on the keystroke that crosses the limit, and would
    // drop the message again on the next keystroke while the value was still over. The card asks
    // for the error the moment the limit is passed and gone the moment it is not, which is what
    // deriving it below gives, the same way `use-outputs-decision` does it.
    const field = useField<string>({
        initialValue: '',
        validate: (value) => (isBlank(value) ? 'Feedback is required.' : null),
    })

    const value = field.getValue()
    const characterCount = countCharactersFromLexical(value)
    const isOverLimit = characterCount > REVIEW_FEEDBACK_MAX_CHARACTERS

    // No useCallback: the React Compiler memoizes this, and hand-memoizing a closure over `field`
    // is what it refuses to preserve.
    const onChange = (json: string) => field.setValue(json)

    // Over-limit outranks the required message: a field that is over the cap is not blank, so the
    // two can never both apply, and the one the reviewer can act on is the one that shows.
    // Mantine types `field.error` as ReactNode, but this hook's `validate` only ever returns
    // strings, and the editors' `error` prop is narrowed to `string` (see `EditorProps.error`).
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

const isBlank = (value: string) => extractTextFromLexical(value).trim().length === 0
