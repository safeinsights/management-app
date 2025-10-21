import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTimer } from './timer'
import { type TimeOpts } from '@/lib/utils'

describe('useTimer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should call trigger at specified intervals when enabled', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }
        const updateInterval: TimeOpts = { 100: 'ms' }

        const { result } = renderHook(() => useTimer({ isEnabled: true, every, trigger, updateInterval }))

        expect(trigger).not.toHaveBeenCalled()
        expect(result.current).toBe(1000)

        // Trigger should be called after the specified interval
        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(trigger).toHaveBeenCalledTimes(1)
    })

    it('should not call trigger when disabled', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }

        const { result } = renderHook(() => useTimer({ isEnabled: false, every, trigger: trigger }))

        expect(result.current).toBe(0)

        act(() => {
            vi.advanceTimersByTime(2000)
        })

        expect(trigger).not.toHaveBeenCalled()
        expect(result.current).toBe(0)
    })

    it('should stop calling trigger when disabled after being enabled', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }
        const updateInterval: TimeOpts = { 100: 'ms' }

        const { rerender } = renderHook(({ isEnabled }) => useTimer({ isEnabled, every, trigger, updateInterval }), {
            initialProps: { isEnabled: true },
        })

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(trigger).toHaveBeenCalledTimes(1)

        rerender({ isEnabled: false })

        act(() => {
            vi.advanceTimersByTime(2000)
        })

        expect(trigger).toHaveBeenCalledTimes(1)
    })

    it('should restart timer when enabled after being disabled', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }
        const updateInterval: TimeOpts = { 100: 'ms' }

        const { rerender } = renderHook(({ isEnabled }) => useTimer({ isEnabled, every, trigger, updateInterval }), {
            initialProps: { isEnabled: false },
        })

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(trigger).not.toHaveBeenCalled()

        rerender({ isEnabled: true })

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(trigger).toHaveBeenCalledTimes(1)
    })

    it('should update interval when every value changes', () => {
        const trigger = vi.fn()
        const updateInterval: TimeOpts = { 100: 'ms' }

        const { rerender } = renderHook(({ every }) => useTimer({ isEnabled: true, every, trigger, updateInterval }), {
            initialProps: { every: { 1000: 'ms' } as TimeOpts },
        })

        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(trigger).toHaveBeenCalledTimes(1)

        rerender({ every: { 500: 'ms' } as TimeOpts })

        act(() => {
            vi.advanceTimersByTime(500)
        })

        expect(trigger).toHaveBeenCalledTimes(2)

        rerender({ every: { 5: 'minutes' } as TimeOpts })

        act(() => {
            vi.advanceTimersByTime(500)
        })
        expect(trigger).toHaveBeenCalledTimes(2)

        vi.advanceTimersByTime(5 * 60 * 1000)
        expect(trigger).toHaveBeenCalledTimes(3)
    })

    it('should clean up interval on unmount', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }

        const { unmount } = renderHook(() => useTimer({ isEnabled: true, every, trigger: trigger }))

        unmount()

        act(() => {
            vi.advanceTimersByTime(2000)
        })

        expect(trigger).not.toHaveBeenCalled()
    })

    it('should return time remaining and update countdown', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }
        const updateInterval: TimeOpts = { 200: 'ms' }

        const { result } = renderHook(() => useTimer({ isEnabled: true, every, trigger, updateInterval }))

        expect(result.current).toBe(1000)

        act(() => {
            vi.advanceTimersByTime(200)
        })

        expect(result.current).toBe(800)

        act(() => {
            vi.advanceTimersByTime(200)
        })

        expect(result.current).toBe(600)
    })

    it('should use custom updateInterval when provided', () => {
        const trigger = vi.fn()
        const every: TimeOpts = { 1000: 'ms' }
        const updateInterval: TimeOpts = { 100: 'ms' }

        const { result } = renderHook(() => useTimer({ isEnabled: true, every, trigger, updateInterval }))

        expect(result.current).toBe(1000)

        act(() => {
            vi.advanceTimersByTime(100)
        })

        expect(result.current).toBe(900)
    })
})
