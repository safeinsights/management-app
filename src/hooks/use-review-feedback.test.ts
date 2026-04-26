import { describe, expect, it, act, renderHook } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/word-count'
import { FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/app/[orgSlug]/study/[studyId]/review/review-types'
import { useReviewFeedback } from './use-review-feedback'

const repeatWords = (count: number) => Array.from({ length: count }, (_, i) => `word${i + 1}`).join(' ')

describe('useReviewFeedback', () => {
    describe('word count', () => {
        it('returns 0 for an empty string', () => {
            const { result } = renderHook(() => useReviewFeedback())

            expect(result.current.wordCount).toBe(0)

            act(() => {
                result.current.onChange(lexicalJson(''))
            })

            expect(result.current.wordCount).toBe(0)
        })

        it('correctly counts words with multiple spaces and newlines', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson('  hello   world\nfoo\n\n bar   baz  '))
            })

            expect(result.current.wordCount).toBe(5)
        })
    })

    describe('isValid', () => {
        it('is false below the minimum word count', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(repeatWords(FEEDBACK_MIN_WORDS - 1)))
            })

            expect(result.current.wordCount).toBe(FEEDBACK_MIN_WORDS - 1)
            expect(result.current.isValid).toBe(false)
        })

        it('is true at exactly the minimum word count (50)', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(repeatWords(FEEDBACK_MIN_WORDS)))
            })

            expect(result.current.wordCount).toBe(FEEDBACK_MIN_WORDS)
            expect(result.current.isValid).toBe(true)
        })

        it('is true at exactly the maximum word count (500)', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(repeatWords(FEEDBACK_MAX_WORDS)))
            })

            expect(result.current.wordCount).toBe(FEEDBACK_MAX_WORDS)
            expect(result.current.isValid).toBe(true)
        })

        it('is false above the maximum word count', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(repeatWords(FEEDBACK_MAX_WORDS + 1)))
            })

            expect(result.current.wordCount).toBe(FEEDBACK_MAX_WORDS + 1)
            expect(result.current.isValid).toBe(false)
        })
    })
})
