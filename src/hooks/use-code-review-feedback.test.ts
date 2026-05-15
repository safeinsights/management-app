import { lexicalJson } from '@/lib/word-count'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCodeReviewFeedback } from './use-code-review-feedback'

describe('useCodeReviewFeedback', () => {
    it('initializes with empty value and invalid state', () => {
        const { result } = renderHook(() => useCodeReviewFeedback())
        expect(result.current.value).toBe('')
        expect(result.current.wordCount).toBe(0)
        expect(result.current.isValid).toBe(false)
        expect(result.current.isOverLimit).toBe(false)
        expect(result.current.minWords).toBe(1)
        expect(result.current.maxWords).toBe(300)
    })

    it('becomes valid once at least one word is entered', () => {
        const { result } = renderHook(() => useCodeReviewFeedback())
        act(() => result.current.onChange(lexicalJson('hello world')))
        expect(result.current.wordCount).toBe(2)
        expect(result.current.isValid).toBe(true)
        expect(result.current.isOverLimit).toBe(false)
    })

    it('flips to invalid + over-limit when word count exceeds the max', () => {
        const { result } = renderHook(() => useCodeReviewFeedback())
        const longText = 'word '.repeat(301).trim()
        act(() => result.current.onChange(lexicalJson(longText)))
        expect(result.current.wordCount).toBe(301)
        expect(result.current.isValid).toBe(false)
        expect(result.current.isOverLimit).toBe(true)
    })

    it('returns to invalid state when cleared back to empty', () => {
        const { result } = renderHook(() => useCodeReviewFeedback())
        act(() => result.current.onChange(lexicalJson('something')))
        expect(result.current.isValid).toBe(true)
        act(() => result.current.onChange(lexicalJson('')))
        expect(result.current.wordCount).toBe(0)
        expect(result.current.isValid).toBe(false)
        expect(result.current.isOverLimit).toBe(false)
    })
})
