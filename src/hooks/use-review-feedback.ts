import { useState } from 'react'
import { FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/lib/proposal-review'
import { countWords } from '@/lib/word-count'

export function useReviewFeedback() {
    const [value, setValue] = useState('')

    const wordCount = countWords(value)
    const isValid = wordCount >= FEEDBACK_MIN_WORDS && wordCount <= FEEDBACK_MAX_WORDS

    return {
        value,
        onChange: setValue,
        wordCount,
        minWords: FEEDBACK_MIN_WORDS,
        maxWords: FEEDBACK_MAX_WORDS,
        isValid,
    }
}
