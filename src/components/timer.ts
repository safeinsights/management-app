import { useEffect, useRef, useState } from 'react'
import { useDidUpdate } from '@mantine/hooks'
import { type TimeOpts, timeOptsToMS } from '@/lib/util'

interface UseTimerOptions {
    isEnabled: boolean
    every: TimeOpts
    trigger: () => void
    updateInterval?: TimeOpts
}

export function useTimer({ isEnabled, every, trigger, updateInterval }: UseTimerOptions) {
    const totalMS = timeOptsToMS(every)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)
    const [timeRemaining, setTimeRemaining] = useState<number>(() => timeOptsToMS(every))
    const startTimeRef = useRef<number>(0)
    let resolvedUpdateInterval: number

    if (updateInterval) {
        resolvedUpdateInterval = timeOptsToMS(updateInterval)
    } else {
        const firstEntry = Object.entries(every)[0]
        const unit = firstEntry[1]
        if (unit.startsWith('second')) {
            resolvedUpdateInterval = Math.min(5000, totalMS) // Update every 5 seconds
        } else if (unit.startsWith('minute')) {
            resolvedUpdateInterval = Math.min(300000, totalMS) // Update every 5 minutes
        } else { // likely ms
            resolvedUpdateInterval = Math.min(250, totalMS) // do not re-render too often, limit to 1/4 second
        }

    }

    useDidUpdate(
        ()=> {
            if (intervalRef.current) clearInterval(intervalRef.current)
            startTimeRef.current = Date.now()
            setTimeRemaining(totalMS)
        },
        [totalMS]
    )
    useEffect(() => {
        if (isEnabled) {
            startTimeRef.current = Date.now()
            intervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTimeRef.current
                const remaining = Math.max(0, totalMS - elapsed)
                if (remaining === 0) {
                    try {
                        trigger()
                    }
                    finally {
                        startTimeRef.current = Date.now()
                        setTimeRemaining(totalMS)
                    }
                } else {
                    setTimeRemaining(remaining)
                }
            }, resolvedUpdateInterval)
        } else {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
                intervalRef.current = null
            }
            setTimeRemaining(0)
        }

        return () => {
            if (intervalRef.current) {
                setTimeRemaining(0)
                clearInterval(intervalRef.current)

                intervalRef.current = null
            }
        }
    }, [isEnabled, totalMS, resolvedUpdateInterval, trigger])

    return timeRemaining
}
