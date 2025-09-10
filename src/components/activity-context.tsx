'use client'

import { useCallback, useEffect } from 'react'
import { useClerk, useSession } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { Button, Space, Stack, Text } from '@mantine/core'
import { usePathname } from 'next/navigation'
import { INACTIVITY_TIMEOUT_MS, WARNING_THRESHOLD_MS } from '@/lib/types'

interface InactivityWarningMessageProps {
    remainingMinutes: number
    onStaySignedIn: () => Promise<void>
}

const InactivityWarningMessage = ({ remainingMinutes, onStaySignedIn }: InactivityWarningMessageProps) => (
    <Stack>
        <Text>
            {`To keep your account secure, you'll be logged out in ${remainingMinutes} minutes due to inactivity. Click 'Stay Signed In' to continue your session.`}
        </Text>
        <Space h="xs" />
        <Button variant="filled" size="sm" onClick={onStaySignedIn}>
            Stay Signed In
        </Button>
    </Stack>
)

export const ActivityContext = () => {
    const { session } = useSession()
    const { signOut } = useClerk()
    const pathname = usePathname()

    const checkInactivity = useCallback(() => {
        if (!session?.lastActiveAt) {
            return
        }

        const lastActiveTime = new Date(session.lastActiveAt).getTime()
        const currentTime = Date.now()
        const inactivityDuration = currentTime - lastActiveTime

        if (inactivityDuration < WARNING_THRESHOLD_MS) {
            // hide notification if the user is active again
            notifications.hide('session-expired')
        }

        if (inactivityDuration >= INACTIVITY_TIMEOUT_MS) {
            notifications.show({
                title: 'Session Expired',
                id: 'session-expired',
                message: "You've been logged out due to inactivity. Log back in to resume your work.",
                withCloseButton: true,
                autoClose: false,
            })
            notifications.hide('inactivity-warning')
            signOut()
        } else if (INACTIVITY_TIMEOUT_MS - inactivityDuration <= WARNING_THRESHOLD_MS) {
            const remainingMinutes = Math.ceil((INACTIVITY_TIMEOUT_MS - inactivityDuration) / 60000)

            const handleStaySignedIn = async () => {
                const updatedSession = await session.touch()
                if (updatedSession) {
                    notifications.hide('inactivity-warning')
                }
            }

            notifications.show({
                title: 'Session Expiration Warning',
                id: 'inactivity-warning',
                withCloseButton: false,
                autoClose: false,
                message: (
                    <InactivityWarningMessage remainingMinutes={remainingMinutes} onStaySignedIn={handleStaySignedIn} />
                ),
            })
        }
    }, [session, signOut])

    useEffect(() => {
        if (!session) {
            notifications.hide('inactivity-warning')
            return
        }

        const intervalId = setInterval(checkInactivity, 10000) // Check every 10 seconds
        return () => clearInterval(intervalId)
    }, [session, checkInactivity])

    useEffect(() => {
        checkInactivity()
    }, [pathname, checkInactivity])

    return null
}
