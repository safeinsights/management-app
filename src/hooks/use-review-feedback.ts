import { useCallback } from 'react'
import { useField } from '@mantine/form'
import { FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/lib/proposal-review'
import { countWordsFromLexical } from '@/lib/lexical'

type UseReviewFeedbackOptions = {
    maxWords?: number
}

/**
 * Required reviewer feedback. Backed by `useField` rather than plain state so leaving the
 * editor without writing anything raises a visible error instead of silently disabling
 * Submit (OTTER-647). The `value` / `onChange` / `wordCount` / `isValid` surface is
 * unchanged for the Yjs-backed editor and the review mutation hooks.
 */
export function useReviewFeedback({ maxWords = FEEDBACK_MAX_WORDS }: UseReviewFeedbackOptions = {}) {
    // No `validateOnBlur`: see the note in `use-review-decision`. This hook exposes `onBlur`
    // rather than spreading `getInputProps`, which is the only place Mantine reads that option.
    const field = useField<string>({
        initialValue: '',
        validate: (value) => {
            const words = countWordsFromLexical(value)
            if (words < FEEDBACK_MIN_WORDS) return 'Feedback is required.'
            if (words > maxWords) return `Feedback must be ${maxWords} words or fewer.`
            return null
        },
    })

    const value = field.getValue()
    const wordCount = countWordsFromLexical(value)

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
        error: field.error,
        wordCount,
        minWords: FEEDBACK_MIN_WORDS,
        maxWords,
        isValid: wordCount >= FEEDBACK_MIN_WORDS && wordCount <= maxWords,
    }
}
