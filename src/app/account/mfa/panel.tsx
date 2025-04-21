'use client'

import React from 'react'
import { useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { Button, Container, Stack, Text } from '@mantine/core'
import { Panel } from '@/components/panel'
import { notifications } from '@mantine/notifications'
import { redirect } from 'next/navigation'

const HasMFA = () => {
    return (
        <Container>
            <Panel title="MFA is enabled">
                <Text>You have successfully enabled MFA on your account</Text>
                <Link href="/" display="inline-block" mt="md">
                    Return to homepage
                </Link>
            </Panel>
        </Container>
    )
}

export const dynamic = 'force-dynamic'

export function ManageMFAPanel() {
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        notifications.show({ message: 'You must be logged in to access this page', color: 'blue' })
        return redirect('/')
    }

    if (user.twoFactorEnabled && !window.location.search.includes('TESTING_FORCE_NO_MFA')) return <HasMFA />

    return (
        <Container>
            <Panel title="Set up Two-Step Verification">
                <Stack gap="lg">
                    <Text size="md">
                        To enhance the security of your account, we’re enforcing two-factor verification at
                        SafeInsights.
                    </Text>
                    <Text size="md" mb="md">
                        Feel free to opt in to use either SMS verification OR Authenticator App verification.
                    </Text>
                    <Link href="/account/mfa/sms">
                        <Button>SMS Verification</Button>
                    </Link>
                    <Link href="/account/mfa/app">
                        <Button>Authenticator App Verification</Button>
                    </Link>
                </Stack>
            </Panel>
        </Container>
    )
}
