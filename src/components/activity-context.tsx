import { ReactNode, useEffect, useRef, useCallback } from 'react'
import { useClerk, useSession } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'

const ActivityContext = ({ children }: { children: ReactNode }) => {
    const clerk = useClerk()
    const sessionData = useSession()

    // Safely access clerk and session data
    const signOut = clerk?.signOut
    const session = sessionData?.session

    const timeoutRef = useRef<NodeJS.Timeout | null>(null)
    const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const INACTIVITY_TIMEOUT = 60 * 1000 * 30 // 30 minutes
    const WARNING_TIMEOUT = INACTIVITY_TIMEOUT - 60 * 1000 * 2 // 2 minutes before timeout

    // Show warning notification
    const showWarningNotification = useCallback(() => {
        notifications.show({
            id: 'inactivity-warning',
            title: 'Your session is about to expire',
            message:
                "To keep your account secure, you’ll be logged out in 2 minutes due to inactivity. Click 'Stay Signed In' to continue your session",
        })
    }, [])

    // Handle complete inactivity timeout - trigger logout
    const notifyInactivity = useCallback(() => {
        // Hide warning notification and show timeout notification
        notifications.hide('inactivity-warning')
        notifications.show({
            id: 'inactivity-timeout',
            title: 'Session Timed Out',
            message: 'Your session has been inactive. Logging out.',
        })

        // Custom event for extensibility
        window.dispatchEvent(new CustomEvent('userInactive', { detail: { lastActiveAt: new Date() } }))

        // Sign out
        if (typeof signOut === 'function') signOut()
    }, [signOut])

    // Reset both inactivity timers when activity detected
    const resetInactivityTimer = useCallback(() => {
        // Clear existing timeouts
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)

        // Hide any existing warning
        notifications.hide('inactivity-warning')

        // Set new warning timeout
        warningTimeoutRef.current = setTimeout(showWarningNotification, WARNING_TIMEOUT)

        // Set new full timeout
        timeoutRef.current = setTimeout(notifyInactivity, INACTIVITY_TIMEOUT)
    }, [INACTIVITY_TIMEOUT, WARNING_TIMEOUT, notifyInactivity, showWarningNotification])

    useEffect(() => {
        // Skip if not in browser environment
        if (typeof window === 'undefined') return

        // Set up activity detection
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']

        // Initialize timers
        resetInactivityTimer()

        // Add all event listeners
        activityEvents.forEach((event) => {
            window.addEventListener(event, resetInactivityTimer)
        })

        // Cleanup on unmount
        return () => {
            // Remove all event listeners
            activityEvents.forEach((event) => {
                window.removeEventListener(event, resetInactivityTimer)
            })

            // Clear timeouts
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current)

            // Hide notifications
            notifications.hide('inactivity-warning')
            notifications.hide('inactivity-timeout')
        }
    }, [session?.lastActiveAt, session?.createdAt, resetInactivityTimer])

    return <>{children}</>
}

export default ActivityContext
