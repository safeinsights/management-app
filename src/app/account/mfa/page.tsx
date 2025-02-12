'use client'

import * as React from 'react'
import { useClerk, useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { Button, Flex, Title } from '@mantine/core'
import { BackupCodeResource } from '@clerk/types'
import { reportError } from '@/components/errors'

const HasMFA = () => {
    return (
        <div>
            <p>
                You have successfully enabled MFA on your account
                <Link href="/">
                    <Button>Return to homepage</Button>
                </Link>
            </p>
        </div>
    )
}

// Generate and display backup codes
function GenerateBackupCodes() {
    const { user } = useUser()
    const [backupCodes, setBackupCodes] = React.useState<BackupCodeResource | undefined>(undefined)

    const [loading, setLoading] = React.useState(false)

    React.useEffect(() => {
        if (backupCodes) {
            return
        }

        setLoading(true)
        void user
            ?.createBackupCode()
            .then((backupCode: BackupCodeResource) => {
                setBackupCodes(backupCode)
                setLoading(false)
            })
            .catch((err) => {
                reportError(err, 'Failed to generate backup codes')
                setLoading(false)
            })
    }, [backupCodes, user])

    if (loading) {
        return <p>Loading...</p>
    }

    if (!backupCodes) {
        return <p>There was a problem generating backup codes</p>
    }

    return (
        <ol>
            {backupCodes.codes.map((code, index) => (
                <li key={index}>{code}</li>
            ))}
        </ol>
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

    if (user.totpEnabled) return <HasMFA />

    return (
        <>
            <Title>MFA is required</Title>

            <Title order={4}>In order to use SafeInsights, your account must have MFA enabled</Title>

            <Flex gap="md">
                <Link href="/account/mfa/app">
                    <Button>Add MFA vai Authenticator App</Button>
                </Link>

                {user.phoneNumbers.length ? (
                    <Link href="/account/mfa/sms">
                        <Button>Add MFA using SMS</Button>
                    </Link>
                ) : (
                    <Flex>
                        <p>You could use SMS MFA if you have a phone number entered on your account.</p>
                        <Button onClick={() => openUserProfile()}>Open user profile to add a new phone number</Button>
                    </Flex>
                )}
            </Flex>

            {/* Manage backup codes */}
            {user.backupCodeEnabled && user.twoFactorEnabled && (
                <div>
                    <p>
                        Generate new backup codes? - <Button onClick={() => setShowNewCodes(true)}>Generate</Button>
                    </p>
                </div>
            )}
            {showNewCodes && (
                <>
                    <GenerateBackupCodes />
                    <Button onClick={() => setShowNewCodes(false)}>Done</Button>
                </>
            )}
        </>
    )
}
