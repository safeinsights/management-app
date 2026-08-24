import { useCallback } from 'react'
import { useField } from '@mantine/form'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { countCharactersFromLexical, extractTextFromLexical } from '@/lib/lexical'
import { overCharacterLimitError } from '@/lib/field-limits'

type UseReviewFeedbackOptions = {
    maxCharacters?: number
}

/**
 * Required reviewer feedback. Backed by `useField` rather than plain state so leaving the
 * editor without writing anything raises a visible error instead of silently disabling
 * Submit (OTTER-647). The `value` / `onChange` / `characterCount` / `isValid` surface is
 * unchanged for the Yjs-backed editor and the review mutation hooks.
 *
 * Emptiness is measured trimmed, the cap is measured raw, so the counter beside the field and
 * the rule that gates it agree (OTTER-737).
 */
export function useReviewFeedback({ maxCharacters = REVIEW_FEEDBACK_MAX_CHARACTERS }: UseReviewFeedbackOptions = {}) {
    // No `validateOnBlur`: see the note in `use-review-decision`. This hook exposes `onBlur`
    // rather than spreading `getInputProps`, which is the only place Mantine reads that option.
    const field = useField<string>({
        initialValue: '',
        validate: (value) => {
            if (isBlank(value)) return 'Feedback is required.'
            if (countCharactersFromLexical(value) > maxCharacters) {
                return overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, maxCharacters)
            }
            return null
        },
    })

    const value = field.getValue()
    const characterCount = countCharactersFromLexical(value)

    const onChange = useCallback(
        (json: string) => {
            field.setValue(json)
        },
        [field],
    )

    return {
        value,
        onChange,
        onBlur: field.validate,
        // Mantine types `field.error` as ReactNode, but this hook's `validate` only ever returns
        // strings, and the editors' `error` prop is narrowed to `string` (see `EditorProps.error`).
        error: field.error as string | null,
        characterCount,
        maxCharacters,
        isValid: !isBlank(value) && characterCount <= maxCharacters,
    }
}

const isBlank = (value: string) => extractTextFromLexical(value).trim().length === 0
