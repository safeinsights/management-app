'use client'

import React, { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { Button, Group, Stack, Title, Container, Text, TextInput } from '@mantine/core'
import { savePhoneNumberAction, verifyPhoneNumberCodeAction } from '@/server/actions/clerk-sms-actions'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'
import { BackupCodeResource, PhoneNumberResource } from '@clerk/types'
import { Link } from '@/components/links'

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
        return <Text>There are currently no phone numbers on your account.</Text>
    }

    return (
        <>
            <Title order={2}>Phone numbers reserved for MFA</Title>
            <ul>
                {mfaPhones.map((phone) => (
                    <Group component="li" key={phone.id} gap="sm" align="center">
                        <Text>
                            {phone.phoneNumber} {phone.defaultSecondFactor && '(Default)'}
                        </Text>
                        <Button 
                            onClick={() => phone.setReservedForSecondFactor({ reserved: false })}
                            miw={150} mih={40}
                        >
                            Disable for MFA
                        </Button>
                        {!phone.defaultSecondFactor && (
                            <Button 
                                onClick={() => phone.makeDefaultSecondFactor()}
                                miw={150} mih={40}
                            >
                                Make default
                            </Button>
                        )}
                        {user.phoneNumbers.length > 1 && (
                            <Button 
                                onClick={() => phone.destroy()}
                                styles={(theme) => ({ root: { minWidth: 150, minHeight: 40 } })}
                            >
                                Remove from account
                            </Button>
                        )}
                    </Group>
                ))}
            </ul>
            <Text>You have enabled MFA on your account</Text>
            <ButtonLink href="/">Return to homepage</ButtonLink>
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
        return <Text>There are currently no verified phone numbers available to be reserved for MFA.</Text>
    }

    return (
        <>
            <Title order={2}>Phone numbers that are not reserved for MFA</Title>

            <ul>
                {availableForMfaPhones.map((phone) => (
                    <Flex component="li" key={phone.id} gap="sm" align="center">
                        <Text>{phone.phoneNumber}</Text>
                        <Button 
                            onClick={() => reservePhoneForMfa(phone)}
                            miw={150} mih={40}
                        >
                            Use for MFA
                        </Button>
                        {user.phoneNumbers.length > 1 && (
                            <Button 
                                onClick={() => phone.destroy()}
                                styles={(theme) => ({ root: { minWidth: 150, minHeight: 40 } })}
                            >
                                Remove from account
                            </Button>
                        )}
                    </Flex>
                ))}
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
    const [phoneNumber, setPhoneNumber] = React.useState('')
    const [verificationCode, setVerificationCode] = React.useState('')
    const [error, setError] = React.useState('')
    const [verificationSuccess, setVerificationSuccess] = React.useState(false)

    // Determine if there's an existing phone record
    const existingPhone = user && user.phoneNumbers && user.phoneNumbers[0]
    const prefilledPhone = existingPhone ? existingPhone.phoneNumber : phoneNumber
    const isPhoneEditable = !existingPhone

    async function handleVerify() {
        // (Assumes user.id is available)
        const phoneToUse = prefilledPhone
        if (!phoneToUse) {
            setError('Please enter a valid phone number')
            return
        }
        // If there's no phone stored, first call the action to save it.
        if (!existingPhone) {
            const res = await savePhoneNumberAction({ userId: user.id, phoneNumber: phoneToUse })
            if (!res.success) {
                setError(`Error saving phone number: ${res.error}`)
                return
            }
        }
        // Attempt to verify with the entered code.
        const verifyRes = await verifyPhoneNumberCodeAction({
            userId: user.id,
            phoneNumber: phoneToUse,
            code: verificationCode,
        })
        if (verifyRes.success && verifyRes.user.phoneNumbers[0].verification.status === 'verified') {
            setVerificationSuccess(true)
            setError('')
        } else {
            setError('try again')
        }
    }

    if (!isLoaded) return null

    if (!user) {
        return <p>You must be logged in to access this page</p>
    }

    return (
        <Container>
            <Panel title="SMS Verification">
                {error && <Text color="red" align="center" mb="md">{error}</Text>}
                <Stack gap="lg">
                    <TextInput
                        label="Phone Number"
                        value={prefilledPhone}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        disabled={!isPhoneEditable}
                    />
                    <TextInput
                        label="Verification Code"
                        placeholder="Enter 6-digit code"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        maxLength={6}
                    />
                    <Button
                        onClick={handleVerify}
                        miw={150} mih={40}
                    >
                        Verify
                    </Button>

                    {verificationSuccess && (
                        <Stack gap="lg">
                            <GenerateBackupCodes />
                            <Button onClick={() => {/* complete final action */}}>
                                Done
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </Panel>
        </Container>
    )
}
