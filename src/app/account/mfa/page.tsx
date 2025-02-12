'use client'

import * as React from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import { Link } from '@/components/links'
import { Container, Button, Flex, Text, Title } from '@mantine/core'
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
    const { openUserProfile } = useClerk()
    const { isLoaded, user } = useUser()
    const [showNewCodes, setShowNewCodes] = React.useState(false)

    if (!isLoaded) return null

    if (!user) {
        return <p>You must be logged in to access this page</p>
    }

    if (user.twoFactorEnabled && !window.location.search.includes('TESTING_FORCE_NO_MFA')) return <HasMFA />

    return (
        <Container>
            <Panel title="MFA is required">
                <Title order={4}>In order to use SafeInsights, your account must have MFA enabled</Title>

                <Flex gap="md">
                    <Link href="/account/mfa/app">
                        <Button>Add MFA with an authenticator app</Button>
                    </Link>

                    {user.phoneNumbers.length ? (
                        <Link href="/account/mfa/sms">
                            <Button>Add MFA using SMS</Button>
                        </Link>
                    ) : (
                        <Flex>
                            <p>You could use SMS MFA if you have a phone number entered on your account.</p>
                            <Button onClick={() => openUserProfile()}>
                                Open user profile to add a new phone number
                            </Button>
                        </Flex>
                    )}
                </Flex>

                {/* Manage backup codes */}
                {user.backupCodeEnabled && user.twoFactorEnabled && (
                    <Text my="md">
                        Generate new backup codes? - <Button onClick={() => setShowNewCodes(true)}>Generate</Button>
                    </Text>
                )}
                {showNewCodes && (
                    <>
                        <GenerateBackupCodes />
                        <Button onClick={() => setShowNewCodes(false)}>Done</Button>
                    </>
                )}
            </Panel>
        </Container>
    )
}
