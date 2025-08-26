'use client'

import React, { useState } from 'react'
import { useReverification, useUser } from '@clerk/nextjs'
import { Anchor, Button, Container, Stack, Text, Paper, Title, Group, Stepper, PinInput } from '@mantine/core'
import { useRouter } from 'next/navigation'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { Link } from '@/components/links'
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
export function AddSMSMFA() {
    const router = useRouter()
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

    const resendCode = async () => {
        await sendVerificationCode(phoneForm.values)
        if (!(lastSentTime && Date.now() - lastSentTime < 30000)) {
            notifications.show({ message: 'A new code has been forwarded!', color: 'green' })
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
                router.push('/account/mfa/app')
            } else {
                otpForm.setFieldError('code', errorToString(phoneVerifyAttempt))
            }
        } catch (err) {
            otpForm.setFieldError(
                'code',
                errorToString(err, { form_code_incorrect: 'Invalid verification code. Please try again.' }),
            )
        }

        // Set phone number as MFA
        try {
            await setReservedForSecondFactor(phoneObj)
            await makeDefaultSecondFactor(phoneObj)
            notifications.show({ message: 'MFA enabled', color: 'green' })
            await user.reload()
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <Container>
            <Paper bg="white" shadow="none" p={30} radius="none">
                <Stack gap="lg">
                    <Stepper
                        unstyled
                        styles={{
                            steps: {
                                display: 'none',
                            },
                        }}
                        active={isVerifying ? 1 : 0}
                        onStepClick={() => null}
                    >
                        <Stepper.Step label="Send verification code" description="Enter your phone number">
                            {!isVerifying && (
                                <form onSubmit={phoneForm.onSubmit((values) => sendVerificationCode(values))}>
                                    <Stack justify="center">
                                        <Title order={2}>SMS verification</Title>
                                        <Text>
                                            Enter your phone number to receive a verification code via SMS to complete
                                            the setup.
                                        </Text>
                                        <Text fz="sm" fw={500}>
                                            Enter phone number
                                        </Text>
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
                                        {phoneForm.errors.phoneNumber && (
                                            <InputError error={phoneForm.errors.phoneNumber} />
                                        )}
                                        <Button
                                            type="submit"
                                            loading={isSendingSms}
                                            w="100%"
                                            size="md"
                                            variant="primary"
                                            radius="sm"
                                            disabled={!/\d{6,}/.test(phoneForm.values.phoneNumber)}
                                        >
                                            Send verification code
                                        </Button>
                                        <Group gap="xs" justify="center">
                                            <Link
                                                href="/account/mfa"
                                                mt="md"
                                                c="purple.5"
                                                fw={600}
                                                fz="md"
                                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                            >
                                                <CaretLeftIcon size={20} />
                                                Back to options
                                            </Link>
                                        </Group>
                                    </Stack>
                                </form>
                            )}
                        </Stepper.Step>
                        <Stepper.Step label="Verify code" description="Enter the code sent to your phone number">
                            {isVerifying && (
                                <form onSubmit={otpForm.onSubmit((values) => verifyCodeAndSetMfa(values))}>
                                    <Stack align="center" gap="sm">
                                        <Title order={2}>Verify your code</Title>
                                        <Text>
                                            We’ve sent a 6-digit code to your phone number ending in {'****'}
                                            {phoneObj?.phoneNumber?.slice(-4)}. Please enter it below to continue.
                                        </Text>

                                        <PinInput
                                            length={6}
                                            placeholder=""
                                            size="lg"
                                            type="number"
                                            align="center"
                                            error={otpForm.errors.code !== undefined}
                                            {...otpForm.getInputProps('code')}
                                        />
                                        {otpForm.errors.code && <InputError error={otpForm.errors.code} />}
                                        <Button
                                            type="submit"
                                            w="100%"
                                            size="md"
                                            variant="primary"
                                            radius="sm"
                                            disabled={!/\d{6,}/.test(phoneForm.values.phoneNumber)}
                                        >
                                            Verify Code
                                        </Button>
                                        <Group>
                                            <Text fz="md" color="grey.7">
                                                Didn’t receive a code? <Anchor onClick={resendCode}>Resend code</Anchor>
                                            </Text>
                                        </Group>
                                        <Group gap="xs" justify="center">
                                            <Link
                                                href="/account/mfa"
                                                mt="md"
                                                c="purple.5"
                                                fw={600}
                                                fz="md"
                                                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                            >
                                                <CaretLeftIcon size={20} />
                                                Back to options
                                            </Link>
                                        </Group>
                                    </Stack>
                                </form>
                            )}
                        </Stepper.Step>
                    </Stepper>
                </Stack>
            </Paper>
        </Container>
    )
}
