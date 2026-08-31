import { describe, expect, it, act, renderHook } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { FEEDBACK_MAX_WORDS, FEEDBACK_MIN_WORDS } from '@/lib/proposal-review'
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
                result.current.onChange(lexicalJson(''))
            })

            expect(result.current.wordCount).toBe(0)
            expect(result.current.isValid).toBe(false)
        })

        it('is true at exactly the minimum word count', () => {
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

const lexicalText = (text: string) =>
    JSON.stringify({
        root: {
            children: [
                {
                    children: [{ detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 }],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                },
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    })

// OTTER-647: these two hooks back the required reviewer fields. Both were plain useState with
// no way to surface "you left this incomplete", which is the whole point of the card.
describe('useReviewFeedback', () => {
    it('starts with no error, so an untouched editor is not pre-emptively flagged', () => {
        const { result } = renderHook(() => useReviewFeedback())

        expect(result.current.error).toBeNull()
        expect(result.current.isValid).toBe(false)
    })

    it('raises a required error when blurred while empty', async () => {
        const { result } = renderHook(() => useReviewFeedback())

        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.error).toBe('Feedback is required.')
    })

    it('clears the error once feedback is written', async () => {
        const { result } = renderHook(() => useReviewFeedback())

        await act(async () => {
            await result.current.onBlur()
        })
        expect(result.current.error).toBe('Feedback is required.')

        act(() => result.current.onChange(lexicalText('This request is feasible with our data.')))
        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.error).toBeNull()
        expect(result.current.isValid).toBe(true)
    })

    it('flags feedback over the word limit', async () => {
        const { result } = renderHook(() => useReviewFeedback({ maxWords: 3 }))

        act(() => result.current.onChange(lexicalText('one two three four')))
        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.error).toBe('Feedback must be 3 words or fewer.')
        expect(result.current.isValid).toBe(false)
    })

    it('reports the live word count for the counter', () => {
        const { result } = renderHook(() => useReviewFeedback())

        act(() => result.current.onChange(lexicalText('one two three')))

        expect(result.current.wordCount).toBe(3)
    })
})
