import { useCallback, useState } from 'react'
import { CODE_REVIEW_MAX_WORDS, CODE_REVIEW_MIN_WORDS } from '@/lib/code-review'
import { countWordsFromLexical } from '@/lib/lexical'

export function useCodeReviewFeedback() {
    const [value, setValue] = useState('')
    const [wordCount, setWordCount] = useState(0)

    const isValid = wordCount >= CODE_REVIEW_MIN_WORDS && wordCount <= CODE_REVIEW_MAX_WORDS
    const isOverLimit = wordCount > CODE_REVIEW_MAX_WORDS

    // Value is the Lexical editor's serialized JSON state. The CollaborativeEditor
    // pushes the JSON on every keystroke; we count words by extracting the plain
    // text from the Lexical tree.
    const onChange = useCallback((next: string) => {
        setValue(next)
        setWordCount(countWordsFromLexical(next))
    }, [])

    return {
        value,
        onChange,
        wordCount,
        minWords: CODE_REVIEW_MIN_WORDS,
        maxWords: CODE_REVIEW_MAX_WORDS,
        isValid,
        isOverLimit,
    }
}
