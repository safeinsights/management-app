import { useState, useEffect } from 'react'

export const LOADING_MESSAGES = [
    'Reticulating splines',
    'Frobulating widgets',
    'Calibrating flux capacitors',
    'Untangling quantum strings',
    'Polishing pixels',
    'Herding electrons',
    'Compiling excuses',
    'Generating witty banter',
    'Aligning cosmic rays',
    'Warming up the hamsters',
]

export function useLoadingMessages(isLoading: boolean, intervalMs = 2000) {
    const [messageIndex, setMessageIndex] = useState(0)

    useEffect(() => {
        if (!isLoading) {
            return
        }

        const interval = setInterval(() => {
            setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length)
        }, intervalMs)

        return () => clearInterval(interval)
    }, [isLoading, intervalMs])

    // When not loading, always show first message to avoid stale state display
    const effectiveIndex = isLoading ? messageIndex : 0

    return {
        message: LOADING_MESSAGES[effectiveIndex],
        messageWithEllipsis: `${LOADING_MESSAGES[effectiveIndex]}…`,
    }
}
