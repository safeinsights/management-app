export class TimeoutError extends Error {}

// A promise that never settles leaves its caller's catch and finally unreachable, so the work is
// raced against a timer. race attaches handlers to both sides, so work that rejects after the timer
// won is consumed here rather than escaping as an unhandled rejection.
export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expiry = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(message)), ms)
    })
    return Promise.race([work, expiry]).finally(() => clearTimeout(timer))
}
