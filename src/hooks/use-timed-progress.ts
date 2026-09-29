import { useEffect, useRef, useState } from 'react'

export interface TimedStep<T> {
    /** Seconds from this step starting until the next one starts; for the last step, until done. */
    estimateSeconds: number
    hasStarted: (data: T) => boolean
}

export interface TimedProgress {
    /** Progress as a fraction, 0-1. */
    value: number
    secondsRemaining: number
}

const TICK_INTERVAL_MS = 100

const totalSeconds = <T>(steps: TimedStep<T>[]): number => steps.reduce((sum, step) => sum + step.estimateSeconds, 0)

// Returns -1 when no step has started.
function furthestStarted<T>(steps: TimedStep<T>[], data: T): number {
    let furthest = -1
    steps.forEach((step, index) => {
        if (step.hasStarted(data)) furthest = index
    })
    return furthest
}

function remainingFrom<T>(steps: TimedStep<T>[], index: number): number {
    return steps.slice(Math.max(index, 0)).reduce((sum, step) => sum + step.estimateSeconds, 0)
}

// Non-animated snapshot; pair with useTimedProgress to animate between updates.
export function timedProgress<T>(steps: TimedStep<T>[], data: T): TimedProgress {
    const total = totalSeconds(steps)
    const secondsRemaining = remainingFrom(steps, furthestStarted(steps, data))
    return { value: total ? (total - secondsRemaining) / total : 0, secondsRemaining }
}

// Never moves backwards; it resets only when the steps un-start, i.e. on a fresh run.
export function useTimedProgress<T>(steps: TimedStep<T>[], data: T, enabled: boolean): TimedProgress {
    const latestRef = useRef({ steps, data })
    const stepStartRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 })
    const [value, setValue] = useState(0)
    const [, forceRerender] = useState(0)

    // Keeps steps/data reachable by the timer without resubscribing it every render.
    useEffect(() => {
        latestRef.current = { steps, data }
    })

    useEffect(() => {
        if (!enabled) return
        const tick = () => {
            const { steps, data } = latestRef.current
            const total = totalSeconds(steps)
            const index = furthestStarted(steps, data)
            const base = total ? (total - remainingFrom(steps, index)) / total : 0
            const stepSeconds = index >= 0 && index < steps.length ? steps[index].estimateSeconds : 0
            const next = base + (total ? stepSeconds / total : 0)

            if (stepStartRef.current.index !== index) {
                const restarted = index < stepStartRef.current.index
                stepStartRef.current = { index, at: Date.now() }
                if (restarted) {
                    setValue(0)
                    forceRerender((n) => n + 1)
                    return
                }
            }

            const elapsed = (Date.now() - stepStartRef.current.at) / 1000
            const fraction = stepSeconds > 0 ? Math.min(elapsed / stepSeconds, 1) : 0
            setValue((prev) => Math.max(prev, base + (next - base) * fraction))
            forceRerender((n) => n + 1)
        }
        const id = setInterval(tick, TICK_INTERVAL_MS)
        return () => clearInterval(id)
    }, [enabled])

    return { value, secondsRemaining: timedProgress(steps, data).secondsRemaining }
}
