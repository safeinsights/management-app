'use client'

import React, { useState } from 'react'
import { useReverification, useUser } from '@clerk/nextjs'
import { Button, Container, Stack, Text, TextInput } from '@mantine/core'
import { Panel } from '@/components/panel'
import { ButtonLink } from '@/components/links'
import { PhoneNumberResource } from '@clerk/types'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { redirect } from 'next/navigation'
import { errorToString } from '@/lib/errors'
import { sleep } from '@/lib/util'
import PhoneInput from 'react-phone-number-input'
import 'react-phone-number-input/style.css'
import styles from './panel.module.css'
import { InputError } from '@/components/errors'

export const dynamic = 'force-dynamic'

// Reference code: https://clerk.com/docs/custom-flows/add-phone
// and: https://clerk.com/docs/custom-flows/manage-sms-based-mfa
export function ManageSMSMFAPanel() {
    const { isLoaded, user } = useUser()
    const [isVerifying, setIsVerifying] = useState(false)
    const [phoneObj, setPhoneObj] = useState<PhoneNumberResource | undefined>()
    const [isSendingSms, setIsSendingSms] = useState(false)
    const [lastSentTime, setLastSentTime] = useState<number | null>(null)
    const createPhoneNumber = useReverification((phone: string) => user?.createPhoneNumber({ phoneNumber: phone }))
    const setReservedForSecondFactor = useReverification((phone: PhoneNumberResource) =>
        phone.setReservedForSecondFactor({ reserved: true }),
    )
    const makeDefaultSecondFactor = useReverification((phone: PhoneNumberResource) => phone.makeDefaultSecondFactor())

    const phoneForm = useForm({
        initialValues: {
            phoneNumber: user?.phoneNumbers[0]?.toString() || '',
        },
    })

    const otpForm = useForm({
        initialValues: {
            code: '',
        },
        validate: {
            code: (value: string) => (value.length !== 6 ? 'Code must be 6 digits' : null),
        },
    })

    if (!isLoaded) return null

    if (!user) {
        notifications.show({ message: 'You must be logged in to access this page', color: 'blue' })
        return redirect('/')
    }

    async function sendVerificationCode(values: typeof phoneForm.values) {
        if (!phoneForm.isValid || isSendingSms) return

        if (lastSentTime && Date.now() - lastSentTime < 30000) {
            notifications.show({
                message: 'You have recently requested a code. Please wait 30 seconds before trying again.',
                color: 'orange',
            })
            return
        }

        setLastSentTime(Date.now())
        setIsSendingSms(true)
        try {
            // Find the phone number from the form values, or create it if it doesn't exist.
            let res = user?.phoneNumbers.find((p) => p.phoneNumber === values.phoneNumber)
            if (!res) {
                res = await createPhoneNumber(values.phoneNumber)
            }

            // Reload user to get updated User object
            await user?.reload()

            // Create a reference to the new phone number to use related methods
            const phoneNumber = user?.phoneNumbers.find((a) => a.id === res?.id)
            setPhoneObj(phoneNumber)

            // Send the user an SMS with the verification code
            await phoneNumber?.prepareVerification()
            await sleep({ 3: 'seconds' })
            setIsSendingSms(false)
            setIsVerifying(true)
        } catch (error) {
            const errorMessage = errorToString(error)

            if (errorMessage?.includes('`phone_number` must be a `phone_number`')) {
                phoneForm.setFieldError('phoneNumber', 'Please enter a valid phone number.')
            } else {
                phoneForm.setFieldError('phoneNumber', errorMessage)
            }

            setIsSendingSms(false)
        }
    }

    const verifyCodeAndSetMfa = async (values: typeof otpForm.values) => {
        if (!otpForm.isValid) return

        if (!phoneObj) {
            notifications.show({ message: 'No phone number found', color: 'red' })
            return
        }

        try {
            // Verify that the provided code matches the code sent to the user
            const phoneVerifyAttempt = await phoneObj.attemptVerification({ code: values.code })

            if (phoneVerifyAttempt.verification.status === 'verified') {
                notifications.show({ message: 'Verification successful', color: 'green' })
                await user.reload()
            } else {
                otpForm.setFieldError('code', errorToString(phoneVerifyAttempt))
            }
        } catch (err) {
            otpForm.setFieldError('code', 'Invalid code. Please try again.')
        }

        // Set phone number as MFA
        try {
            await setReservedForSecondFactor(phoneObj)
            await makeDefaultSecondFactor(phoneObj)
            notifications.show({ message: 'MFA enabled', color: 'green' })
            await user.reload()
        } catch {
            notifications.show({ message: 'Error setting phone number as MFA', color: 'red' })
        }
    }

    return (
        <Container>
            <Panel title="SMS Verification">
                <Stack gap="lg">
                    <Text>
                        Enter your preferred phone number and click &apos;Send Code.&apos; Once you receive the code,
                        simply enter it below to complete the process.
                    </Text>

                    <form onSubmit={phoneForm.onSubmit((values) => sendVerificationCode(values))}>
                        <Stack>
                            <PhoneInput
                                international
                                countryCallingCodeEditable={false}
                                defaultCountry="US"
                                value={phoneForm.values.phoneNumber}
                                onChange={(value) => phoneForm.setFieldValue('phoneNumber', value ?? '')}
                                placeholder="Enter phone number"
                                countries={['US']} // limited to US code
                                className={styles.phoneInput}
                                label="Phone Number"
                            />
                            {phoneForm.errors.phoneNumber && <InputError error={phoneForm.errors.phoneNumber} />}
                            <Button type="submit" loading={isSendingSms}>
                                Send Code
                            </Button>
                        </Stack>
                    </form>

                    {isVerifying && (
                        <form onSubmit={otpForm.onSubmit((values) => verifyCodeAndSetMfa(values))}>
                            <Stack>
                                <Text>Enter the code sent to {phoneObj?.phoneNumber}</Text>

                                <TextInput type="number" label="Input Code" {...otpForm.getInputProps('code')} />
                                <Button type="submit">Verify Code</Button>
                            </Stack>
                        </form>
                    )}

                    {user?.hasVerifiedPhoneNumber && user?.twoFactorEnabled && (
                        <Stack gap="lg">
                            <Text>Phone number verified and enabled for MFA!</Text>
                            <ButtonLink href="/">Done - Return to Homepage</ButtonLink>
                        </Stack>
                    )}
                </Stack>
            </Panel>
        </Container>
    )
}
