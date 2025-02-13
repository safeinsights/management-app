'use client'

import * as React from 'react'
import { useUser, useClerk } from '@clerk/nextjs'

import { Button, Flex, Title } from '@mantine/core'
import { BackupCodeResource, PhoneNumberResource } from '@clerk/types'
import Link from 'next/link'

// Display phone numbers reserved for MFA
const ManageMfaPhoneNumbers = () => {
    const { user } = useUser()

    if (!user) return null

    // Check if any phone numbers are reserved for MFA
    const mfaPhones = user.phoneNumbers
        .filter((ph) => ph.verification.status === 'verified')
        .filter((ph) => ph.reservedForSecondFactor)
        .sort((ph: PhoneNumberResource) => (ph.defaultSecondFactor ? -1 : 1))

    if (user.phoneNumbers.length === 0) {
        return <p>There are currently no phone numbers on your account.</p>
    }

    return (
        <>
            <h2>Phone numbers reserved for MFA</h2>
            <ul>
                {mfaPhones.map((phone) => {
                    return (
                        <li key={phone.id} style={{ display: 'flex', gap: '10px' }}>
                            <p>
                                {phone.phoneNumber} {phone.defaultSecondFactor && '(Default)'}
                            </p>
                            <div>
                                <Button onClick={() => phone.setReservedForSecondFactor({ reserved: false })}>
                                    Disable for MFA
                                </Button>
                            </div>

                            {!phone.defaultSecondFactor && (
                                <div>
                                    <Button onClick={() => phone.makeDefaultSecondFactor()}>Make default</Button>
                                </div>
                            )}

                            {user.phoneNumbers.length > 1 && (
                                <div>
                                    <Button onClick={() => phone.destroy()}>Remove from account</Button>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
            You have enabled MFA on your account
            <Link href="/">
                <Button>Return to homepage</Button>
            </Link>
        </>
    )
}

// Display phone numbers that are not reserved for MFA
const ManageAvailablePhoneNumbers = () => {
    const { user } = useUser()

    if (!user) return null

    // Reserve a phone number for MFA
    const reservePhoneForMfa = async (phone: PhoneNumberResource) => {
        // Set the phone number as reserved for MFA
        await phone.setReservedForSecondFactor({ reserved: true })
        // Refresh the user information to reflect changes
        await user.reload()
    }

    // phone numbers are valid for MFA but aren't used for it
    const availableForMfaPhones = user.phoneNumbers.filter(
        (phone) => phone.verification.status === 'verified' && !phone.reservedForSecondFactor,
    )

    if (availableForMfaPhones.length) {
        return <p>There are currently no verified phone numbers available to be reserved for MFA.</p>
    }

    return (
        <>
            <h2>Phone numbers that are not reserved for MFA</h2>

            <ul>
                {availableForMfaPhones.map((phone) => {
                    return (
                        <li key={phone.id} style={{ display: 'flex', gap: '10px' }}>
                            <p>{phone.phoneNumber}</p>
                            <div>
                                <Button onClick={() => reservePhoneForMfa(phone)}>Use for MFA</Button>
                            </div>
                            {user.phoneNumbers.length > 1 && (
                                <div>
                                    <Button onClick={() => phone.destroy()}>Remove from account</Button>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
        </>
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
                // See https://clerk.com/docs/custom-flows/error-handling
                // for more info on error handling
                console.error(JSON.stringify(err, null, 2))
                setLoading(false)
            })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

export default function ManageSMSMFA() {
    const [showBackupCodes, setShowBackupCodes] = React.useState(false)
    const { openUserProfile } = useClerk()
    const { isLoaded, user } = useUser()

    if (!isLoaded) return null

    if (!user) {
        return <p>You must be logged in to access this page</p>
    }

    return (
        <>
            <Title mb="lg">MFA using SMS</Title>
            <Flex direction="column" gap="md">
                <ManageMfaPhoneNumbers />
                <ManageAvailablePhoneNumbers />

                <Button w="fit-content" onClick={() => openUserProfile()}>
                    Open user profile to add a new phone number
                </Button>

                {/* Manage backup codes */}
                {user.twoFactorEnabled && (
                    <div>
                        <p>
                            Generate new backup codes? -{' '}
                            <Button onClick={() => setShowBackupCodes(true)}>Generate</Button>
                        </p>
                    </div>
                )}
                {showBackupCodes && (
                    <>
                        <GenerateBackupCodes />
                        <Button w="fit-content" onClick={() => setShowBackupCodes(false)}>
                            Done
                        </Button>
                    </>
                )}
            </Flex>
        </>
    )
}
