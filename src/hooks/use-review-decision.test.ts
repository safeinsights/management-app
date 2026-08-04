import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@/tests/unit.helpers'
import { useReviewDecision } from './use-review-decision'

// OTTER-647: the decision radio group is required but was plain useState, with no way to
// surface that the reviewer left it unanswered.
describe('useReviewDecision', () => {
    it('starts unselected with no error', () => {
        const { result } = renderHook(() => useReviewDecision())

        expect(result.current.selected).toBeNull()
        expect(result.current.error).toBeNull()
    })

    it('raises a required error when blurred with nothing chosen', async () => {
        const { result } = renderHook(() => useReviewDecision())

        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.error).toBe('Select a decision to continue.')
    })

    it('clears the error once a decision is chosen', async () => {
        const { result } = renderHook(() => useReviewDecision())

        await act(async () => {
            await result.current.onBlur()
        })
        expect(result.current.error).toBe('Select a decision to continue.')

        act(() => result.current.onSelect('approve'))
        await act(async () => {
            await result.current.onBlur()
        })

        expect(result.current.selected).toBe('approve')
        expect(result.current.error).toBeNull()
    })
})
