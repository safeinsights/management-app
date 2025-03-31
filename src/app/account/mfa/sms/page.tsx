'use client'

import React from 'react'
import { useUser} from '@clerk/nextjs'
import { Button, Group, Stack, Title, Container, Text, TextInput} from '@mantine/core'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'
import { PhoneNumberResource } from '@clerk/types'
import { GenerateBackupCodes } from '../backup-codes'

export default function ManageSMSMFA() {
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
    const existingPhone = user?.phoneNumbers?.[0]
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
        } catch (err: unknown) {
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
        } catch (err: unknown) {
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
                        Enter your preferred phone number and click &apos;Send Code.&apos; Once you receive the code, simply enter it below to complete the process.
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

                    {/* Show verification input/button only when verification is NOT successful */}
                    {!verificationSuccess && (
                        <>
                            <TextInput
                                label="Verification Code"
                                placeholder="Enter 6-digit code"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                maxLength={6}
                                disabled={!codeSent || isVerifying} // Disable until code is sent or while verifying
                            />
                            <Button
                                onClick={handleVerify}
                                disabled={!codeSent || !verificationCode || verificationCode.length !== 6 || isVerifying} // Disable until code sent and valid code entered, or while verifying
                                loading={isVerifying}
                                miw={150} mih={40}
                            >
                                Verify Code
                            </Button>
                        </>
                    )}

                    {verificationSuccess && (
                        <Stack gap="lg">
                            <Text color="green" ta="center">Phone number verified and enabled for MFA!</Text>
                            <Title order={3} ta="center">Save Your Backup Codes</Title>
                            <Text ta="center">Store these codes securely. They are needed if you lose access to your phone.</Text>
                            <GenerateBackupCodes />
                            <ButtonLink href="/">Done - Return to Homepage</ButtonLink>
                        </Stack>
                    )}
                </Stack>
            </Panel>
        </Container>
    )
}
