'use client'

import React, { useState, useEffect } from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { Button, Group, Stack, Title, Container, Text, TextInput, Code } from '@mantine/core'
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

    if (availableForMfaPhones.length === 0) {
        return <Text>There are currently no verified phone numbers available to be reserved for MFA.</Text>
    }

    return (
        <>
            <Title order={2}>Phone numbers that are not reserved for MFA</Title>

            <ul>
                {availableForMfaPhones.map((phone) => (
                    <Group component="li" key={phone.id} gap="sm" align="center">
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
                    </Group>
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
                <li key={index}><Code fz="lg">{code}</Code></li>
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
    const [codeSent, setCodeSent] = React.useState(false)
    const [isSendingCode, setIsSendingCode] = React.useState(false)
    const [isVerifying, setIsVerifying] = React.useState(false)
    const [phoneResourceToVerify, setPhoneResourceToVerify] = React.useState<PhoneNumberResource | null>(null)

    // Determine if there's an existing phone record
    const existingPhone = user && user.phoneNumbers && user.phoneNumbers[0]
    const prefilledPhone = existingPhone ? existingPhone.phoneNumber : phoneNumber
    const isPhoneEditable = !existingPhone

    async function handleSendCode() {
        if (!user) return

        const phoneToUse = existingPhone ? existingPhone.phoneNumber : phoneNumber
        if (!phoneToUse) {
            setError('Please enter a valid phone number')
            return
        }

        setIsSendingCode(true)
        setError('')
        setCodeSent(false)
        setPhoneResourceToVerify(null)

        try {
            let phoneResource: PhoneNumberResource | undefined = existingPhone

            // If no existing phone, create one using the client SDK
            if (!phoneResource && isPhoneEditable) {
                phoneResource = await user.createPhoneNumber({ phoneNumber: phoneToUse })
            }

            if (!phoneResource) {
                throw new Error("Could not find or create phone number resource.")
            }

            // Prepare the verification (this sends the code via Clerk)
            await phoneResource.prepareVerification()
            setPhoneResourceToVerify(phoneResource)
            setCodeSent(true)
        } catch (err: any) {
            console.error('Error sending code:', err)
            const clerkError = err.errors?.[0]
            setError(clerkError?.longMessage || clerkError?.message || 'Failed to send verification code. Please check the number and try again.')
        } finally {
            setIsSendingCode(false)
        }
    }

    async function handleVerify() {
        if (!user || !phoneResourceToVerify || !verificationCode) {
            setError('Verification code is required.')
            return
        }

        setIsVerifying(true)
        setError('')

        try {
            const verifiedPhoneResource = await phoneResourceToVerify.attemptVerification({ code: verificationCode })

            if (verifiedPhoneResource.verification.status === 'verified') {
                await verifiedPhoneResource.setReservedForSecondFactor({ reserved: true })
                await verifiedPhoneResource.makeDefaultSecondFactor()

                setVerificationSuccess(true)
                await user.reload()
            } else {
                setError('Verification failed. Please try again.')
            }
        } catch (err: any) {
            console.error('Error verifying code:', err)
            const clerkError = err.errors?.[0]
            setError(clerkError?.longMessage || clerkError?.message || 'Invalid verification code. Please try again.')
            setVerificationSuccess(false)
        } finally {
            setIsVerifying(false)
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
                    <Text size="md" mb="md">
                        Enter your preferred phone number and click 'Send Code.' Once you receive the code, simply enter it below to complete the process.
                    </Text>
                    {!verificationSuccess && (
                        <Group align="flex-end" gap="md">
                            <TextInput
                                label="Phone Number"
                                placeholder="Enter phone number with country code"
                                value={prefilledPhone}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                disabled={!isPhoneEditable || codeSent || isSendingCode}
                                style={{ flexGrow: 1 }}
                            />
                            <Button
                                onClick={handleSendCode}
                                disabled={codeSent || isSendingCode || (!isPhoneEditable && !phoneNumber) || !!existingPhone}
                                loading={isSendingCode}
                                miw={120}
                            >
                                {codeSent ? 'Code Sent' : 'Send Code'}
                            </Button>
                        </Group>
                    )}

                    {codeSent && !verificationSuccess && (
                        <>
                            <TextInput
                                label="Verification Code"
                                placeholder="Enter 6-digit code"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                maxLength={6}
                                disabled={isVerifying}
                            />
                            <Button
                                onClick={handleVerify}
                                disabled={!verificationCode || verificationCode.length !== 6 || isVerifying}
                                loading={isVerifying}
                                miw={150} mih={40}
                            >
                                Verify Code
                            </Button>
                        </>
                    )}

                    {verificationSuccess && (
                        <Stack gap="lg">
                            <Text color="green" align="center">Phone number verified and enabled for MFA!</Text>
                            <Title order={3} align="center">Save Your Backup Codes</Title>
                            <Text align="center">Store these codes securely. They are needed if you lose access to your phone.</Text>
                            <GenerateBackupCodes />
                            <ButtonLink href="/">Done - Return to Homepage</ButtonLink>
                        </Stack>
                    )}
                </Stack>
            </Panel>
        </Container>
    )
}
