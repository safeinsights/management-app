import { afterEach, describe, expect, it, vi } from '@/tests/unit.helpers'
import { TimeoutError, withTimeout } from './with-timeout'

describe('withTimeout', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('resolves with the work and leaves no timer behind', async () => {
        vi.useFakeTimers()

        await expect(withTimeout(Promise.resolve('done'), 5_000, 'too slow')).resolves.toBe('done')
        expect(vi.getTimerCount()).toBe(0)
    })

    it('rejects with a TimeoutError once the bound passes', async () => {
        vi.useFakeTimers()
        const settled = expect(withTimeout(new Promise<void>(() => {}), 5_000, 'too slow')).rejects.toThrow(
            TimeoutError,
        )

        await vi.advanceTimersByTimeAsync(5_000)
        await settled
    })

    // The late rejection has a handler from race, so it cannot escape as an unhandled rejection.
    it('keeps the timeout result when the work rejects afterwards', async () => {
        vi.useFakeTimers()
        const late = new Promise<void>((_, reject) => setTimeout(() => reject(new Error('late')), 10_000))
        const settled = expect(withTimeout(late, 5_000, 'too slow')).rejects.toThrow('too slow')

        await vi.advanceTimersByTimeAsync(10_000)
        await settled
    })
})
