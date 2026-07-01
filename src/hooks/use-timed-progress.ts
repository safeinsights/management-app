import { useEffect, useRef, useState } from 'react'

export interface TimedStep<T> {
    // Estimated seconds from when this step starts until the next one starts (the last step, until done).
    estimateSeconds: number
    // Whether this step has started, evaluated against the current data.
    hasStarted: (data: T) => boolean
}

export interface TimedProgress {
    // Progress as a fraction, 0–1.
    value: number
    // Estimated seconds remaining from the furthest started step onward.
    secondsRemaining: number
}

// How often the bar interpolates toward the next step (and re-renders relative-time displays).
const TICK_INTERVAL_MS = 100

const totalSeconds = <T>(steps: TimedStep<T>[]): number => steps.reduce((sum, step) => sum + step.estimateSeconds, 0)

// Index of the furthest step that has started, or -1 if none have.
function furthestStarted<T>(steps: TimedStep<T>[], data: T): number {
    let furthest = -1
    steps.forEach((step, index) => {
        if (step.hasStarted(data)) furthest = index
    })
    return furthest
}

// Seconds estimated to remain once `index` is the furthest started step.
function remainingFrom<T>(steps: TimedStep<T>[], index: number): number {
    return steps.slice(Math.max(index, 0)).reduce((sum, step) => sum + step.estimateSeconds, 0)
}

// Non-animated snapshot: the bar value at the furthest started step and the seconds remaining. The
// value is the elapsed-estimate share (steps already completed); pair with useTimedProgress to animate
// toward the next step between updates.
export function timedProgress<T>(steps: TimedStep<T>[], data: T): TimedProgress {
    const total = totalSeconds(steps)
    const secondsRemaining = remainingFrom(steps, furthestStarted(steps, data))
    return { value: total ? (total - secondsRemaining) / total : 0, secondsRemaining }
}

// Animated progress over ordered, timed steps. The bar jumps to each step as it starts, then
// interpolates toward the next step using that step's estimate — advancing each tick, capped at the
// next step and never moving backwards (it resets only when the steps un-start, i.e. a fresh run). The
// tick also re-renders the caller so any relative-time display it shows stays current.
export function useTimedProgress<T>(steps: TimedStep<T>[], data: T, enabled: boolean): TimedProgress {
    const latestRef = useRef({ steps, data })
    const stepStartRef = useRef<{ index: number; at: number }>({ index: -1, at: 0 })
    const [value, setValue] = useState(0)
    const [, forceRerender] = useState(0)

    // Keep the latest steps/data reachable by the timer without resubscribing it on every render.
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
