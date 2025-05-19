'use client'

import { useEffect } from 'react'
import { useSession, useClerk } from '@clerk/nextjs'
import { notifications } from '@mantine/notifications'
import { Button, Text, Space, Stack } from '@mantine/core'

export const ActivityContext = () => {
    const { session } = useSession()
    const { signOut } = useClerk()

    useEffect(() => {
        if (!session) return

        const getRemainingTime = () => {
            if (!session.lastActiveAt || !session.expireAt) return null
            const expireTime = new Date(session.expireAt).getTime()
            const currentTime = new Date().getTime()
            const remainingMs = expireTime - currentTime

            return Math.max(0, Math.floor(remainingMs / 1000)) // Convert to seconds
        }

        // Set up interval to check remaining time
        const intervalId = setInterval(() => {
            const remaining = getRemainingTime()

            if (remaining !== null && remaining <= 2 * 60) {
                // 2 minute warning
                notifications.show({
                    title: 'Session Expiration Warning',
                    id: 'inactivity-warning',
                    message: (
                        <Stack>
                            <Text>
                                {`To keep your account secure, you'll be logged out in ${Math.floor(remaining / 60)} minutes due to inactivity. Click 'Stay Signed In' to continue your session.`}
                            </Text>
                            <Space h="xs" />
                            <Button
                                variant="filled"
                                size="sm"
                                onClick={() => {
                                    session.touch()
                                    notifications.hide('inactivity-warning')
                                }}
                            >
                                Stay Signed In
                            </Button>
                        </Stack>
                    ),
                })
            }

            if (remaining !== null && remaining <= 0) {
                notifications.show({
                    title: 'Session Expired',
                    message: "You've been logged out due to inactivity. Log back in to resume your work.",
                    withCloseButton: true,
                })
                signOut()
            }
        }, 10000) // Check every 10 seconds

        return () => clearInterval(intervalId)
    }, [session, signOut])

    return null
}
