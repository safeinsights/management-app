'use client'

import { useEffect } from 'react'
import { useClerk, useSession } from '@clerk/clerk-react'
import { notifications } from '@mantine/notifications'
import { Button, Text, Space, Stack } from '@mantine/core'
import { INACTIVITY_TIMEOUT_MS, WARNING_THRESHOLD_MS } from '@/lib/types'
import { DEV_ENV } from '@/server/config'

export const ActivityContext = () => {
    const { session } = useSession()
    const { signOut } = useClerk()

    useEffect(() => {
        if (DEV_ENV || !session) return

        const checkInactivity = () => {
            if (!session.lastActiveAt) return

            const lastActiveTime = new Date(session.lastActiveAt).getTime()
            const currentTime = Date.now()
            const inactivityDuration = currentTime - lastActiveTime

            if (inactivityDuration < WARNING_THRESHOLD_MS) {
                // Hide the signout notification if the user is active again
                notifications.hide('session-expired')
            }

            if (inactivityDuration >= INACTIVITY_TIMEOUT_MS) {
                notifications.show({
                    title: 'Session Expired',
                    id: 'session-expired',
                    message: 'You’ve been logged out due to inactivity. Log back in to resume your work.',
                    withCloseButton: true,
                    autoClose: false,
                })
                notifications.hide('inactivity-warning')
                clearInterval(intervalId)
                signOut()
            } else if (INACTIVITY_TIMEOUT_MS - inactivityDuration <= WARNING_THRESHOLD_MS) {
                notifications.show({
                    title: 'Session Expiration Warning',
                    id: 'inactivity-warning',
                    withCloseButton: false,
                    autoClose: false,
                    message: (
                        <Stack>
                            <Text>
                                {`To keep your account secure, you'll be logged out in ${Math.ceil(
                                    (INACTIVITY_TIMEOUT_MS - inactivityDuration) / 60000,
                                )} minutes due to inactivity. Click 'Stay Signed In' to continue your session.`}
                            </Text>
                            <Space h="xs" />
                            <Button
                                variant="filled"
                                size="sm"
                                onClick={async () => {
                                    const updatedSession = await session.touch()
                                    if (updatedSession) {
                                        notifications.hide('inactivity-warning')
                                    }
                                }}
                            >
                                Stay Signed In
                            </Button>
                        </Stack>
                    ),
                })
            }
        }

        const intervalId = setInterval(checkInactivity, 10000) // Check every 10 seconds

        return () => clearInterval(intervalId)
    }, [session, signOut])

    return null
}
