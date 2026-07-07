import { vi } from 'vitest'
import { act, describe, expect, it, renderHook } from '@/tests/unit.helpers'
import { timedProgress, useTimedProgress, type TimedStep } from './use-timed-progress'

// `data` is the count of steps that have started; total estimate is 60s.
const steps: TimedStep<number>[] = [
    { estimateSeconds: 10, hasStarted: (n) => n >= 1 },
    { estimateSeconds: 20, hasStarted: (n) => n >= 2 },
    { estimateSeconds: 30, hasStarted: (n) => n >= 3 },
]

describe('timedProgress', () => {
    it('is 0 with the full estimate remaining before anything starts', () => {
        expect(timedProgress(steps, 0)).toEqual({ value: 0, secondsRemaining: 60 })
    })

    it('reports the completed fraction (0–1) and the remaining estimate as steps start', () => {
        const two = timedProgress(steps, 2)
        expect(two.value).toBeCloseTo(1 / 6, 5)
        expect(two.secondsRemaining).toBe(50)
        expect(timedProgress(steps, 3)).toEqual({ value: 0.5, secondsRemaining: 30 })
    })
})

describe('useTimedProgress', () => {
    it('interpolates toward the next step each tick, capped there and never going backwards', () => {
        vi.useFakeTimers()
        try {
            // two steps started (furthest index 1): base 1/6, next 1/2.
            const { result } = renderHook(() => useTimedProgress(steps, 2, true))
            expect(result.current.value).toBe(0)

            act(() => vi.advanceTimersByTime(100)) // first tick jumps to the step's base
            const atStart = result.current.value
            expect(atStart).toBeCloseTo(1 / 6, 5)

            act(() => vi.advanceTimersByTime(10000)) // halfway through the 20s step → ~1/3
            expect(result.current.value).toBeGreaterThan(atStart)
            const midway = result.current.value

            act(() => vi.advanceTimersByTime(60000)) // past the step → capped at next, not beyond
            expect(result.current.value).toBeGreaterThanOrEqual(midway)
            expect(result.current.value).toBeCloseTo(0.5, 5)
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not advance while disabled', () => {
        vi.useFakeTimers()
        try {
            const { result } = renderHook(() => useTimedProgress(steps, 3, false))
            act(() => vi.advanceTimersByTime(10000))
            expect(result.current.value).toBe(0)
            expect(result.current.secondsRemaining).toBe(30)
        } finally {
            vi.useRealTimers()
        }
    })
})
