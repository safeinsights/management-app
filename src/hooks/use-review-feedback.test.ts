import { describe, expect, it, act, renderHook } from '@/tests/unit.helpers'
import { lexicalJson } from '@/lib/lexical'
import { REVIEW_FEEDBACK_FIELD_TITLE, REVIEW_FEEDBACK_MAX_CHARACTERS } from '@/lib/proposal-review'
import { overCharacterLimitError } from '@/lib/field-limits'
import { useReviewFeedback } from './use-review-feedback'

const repeat = (count: number) => 'x'.repeat(count)

describe('useReviewFeedback', () => {
    describe('character count', () => {
        it('returns 0 for an empty string', () => {
            const { result } = renderHook(() => useReviewFeedback())

            expect(result.current.characterCount).toBe(0)

            act(() => {
                result.current.onChange(lexicalJson(''))
            })

            expect(result.current.characterCount).toBe(0)
        })

        it('counts whitespace and newlines, because the counter counts what the user typed', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson('a b\nc'))
            })

            expect(result.current.characterCount).toBe(5)
        })
    })

    describe('isValid', () => {
        it('is false while the field is empty', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(''))
            })

            expect(result.current.characterCount).toBe(0)
            expect(result.current.isValid).toBe(false)
        })

        it('is false for whitespace-only feedback', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson('   '))
            })

            expect(result.current.isValid).toBe(false)
        })

        it('is true for a single character', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson('x'))
            })

            expect(result.current.isValid).toBe(true)
        })

        it('is true at exactly the maximum character count (1800)', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(repeat(REVIEW_FEEDBACK_MAX_CHARACTERS)))
            })

            expect(result.current.characterCount).toBe(REVIEW_FEEDBACK_MAX_CHARACTERS)
            expect(result.current.isValid).toBe(true)
        })

        it('is false above the maximum character count', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(repeat(REVIEW_FEEDBACK_MAX_CHARACTERS + 1)))
            })

            expect(result.current.characterCount).toBe(REVIEW_FEEDBACK_MAX_CHARACTERS + 1)
            expect(result.current.isValid).toBe(false)
        })

        // Characters, not words: 400 short words is past the old 300-word code-review cap and
        // inside 1800 characters, so this fails if word counting survived.
        it('measures characters rather than words', () => {
            const { result } = renderHook(() => useReviewFeedback())

            act(() => {
                result.current.onChange(lexicalJson(Array.from({ length: 400 }, () => 'ab').join(' ')))
            })

            expect(result.current.isValid).toBe(true)
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

    it('flags feedback over the character limit, naming the field and the cap', async () => {
        const { result } = renderHook(() => useReviewFeedback({ maxCharacters: 3 }))

        act(() => result.current.onChange(lexicalText('four')))
        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.error).toBe(overCharacterLimitError(REVIEW_FEEDBACK_FIELD_TITLE, 3))
        expect(result.current.isValid).toBe(false)
    })

    it('reports only the required message for an empty field, never both rules at once', async () => {
        const { result } = renderHook(() => useReviewFeedback({ maxCharacters: 3 }))

        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.error).toBe('Feedback is required.')
    })

    it('reports the live character count for the counter', () => {
        const { result } = renderHook(() => useReviewFeedback())

        act(() => result.current.onChange(lexicalText('one two three')))

        expect(result.current.characterCount).toBe(13)
    })
})
