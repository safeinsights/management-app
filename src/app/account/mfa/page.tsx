'use client'

import React, { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { Container, Button, Stack, Text } from '@mantine/core'
import { GenerateBackupCodes } from './backup-codes'
import { Panel } from '@/components/panel'

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

export default function ManageMFA() {
    const { isLoaded, user } = useUser()
    const [showNewCodes, setShowNewCodes] = useState(false)

    if (!isLoaded) return null

    if (!user) {
        return <p>You must be logged in to access this page</p>
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

                    {/* {user.phoneNumbers.length ? (
                        <Link href="/account/mfa/sms">
                            <Button>Add MFA using SMS</Button>
                        </Link>
                    ) : (
                        <>
                            <Button onClick={() => openUserProfile()}>SMS Verification</Button>
                        </>
                    )} */}
                </Stack>

                {/* Manage backup codes */}
                {user.backupCodeEnabled && user.twoFactorEnabled && (
                    <Stack gap="sm" mt="lg">
                        <Text size="md">Generate new backup codes?</Text>
                        <Button onClick={() => setShowNewCodes(true)}>Generate</Button>
                    </Stack>
                )}
                {showNewCodes && (
                    <Stack gap="sm" mt="lg">
                        <GenerateBackupCodes />
                        <Button onClick={() => setShowNewCodes(false)}>Done</Button>
                    </Stack>
                )}
            </Panel>
        </Container>
    )
}
