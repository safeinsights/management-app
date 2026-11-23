import { act } from '@testing-library/react'
import { vi } from 'vitest'

// Fakes only the timer queue, so Date and performance stay real for the database. Real time keeps
// flowing for waitFor; advanceTimers jumps the queue to fire a debounce or show nothing more fires.
export const fakeTimeouts = () =>
    vi.useFakeTimers({
        shouldAdvanceTime: true,
        toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })

export const advanceTimers = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
    })
}

// Not flushed first: a query run under fake timers queues pg-pool's idle timer, and firing it closes
// the client the test transaction runs on, failing this test and the next.
export const restoreRealTimers = () => {
    vi.useRealTimers()
}
