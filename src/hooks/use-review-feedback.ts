import { useCallback, useState } from 'react'
import { FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/lib/proposal-review'
import { countWordsFromLexical } from '@/lib/word-count'

export function useReviewFeedback() {
    const [value, setValue] = useState('')
    const [wordCount, setWordCount] = useState(0)

    const isValid = wordCount >= FEEDBACK_MIN_WORDS && wordCount <= FEEDBACK_MAX_WORDS

    const onChange = useCallback((json: string) => {
        setValue(json)
        setWordCount(countWordsFromLexical(json))
    }, [])

    return {
        value,
        onChange,
        wordCount,
        minWords: FEEDBACK_MIN_WORDS,
        maxWords: FEEDBACK_MAX_WORDS,
        isValid,
    }
}
