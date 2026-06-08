import { InputError } from '@/components/errors'
import OtpInput from '@/components/otp-input'
import { SignInResource } from '@clerk/types'
import { Anchor, Button, Group, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'

interface SmsVerificationProps {
    signIn: SignInResource | null
    phoneNumber?: string
    form: UseFormReturnType<{ code: string }>
    isVerifyingCode: boolean
}

export const SmsVerification = ({ signIn, phoneNumber, form, isVerifyingCode }: SmsVerificationProps) => {
    const [canResendCode, setCanResendCode] = useState(true)

    const resendCode = async () => {
        if (!signIn) return
        try {
            if (canResendCode) {
                await signIn.prepareSecondFactor({ strategy: 'phone_code' })
                notifications.show({ message: 'A new code has been forwarded!', color: 'green' })
                setCanResendCode(false)
                setTimeout(() => setCanResendCode(true), 30000)
            }
        } catch {
            reportError('Error resending code')
        }
    }

    return (
        <>
            <Text>
                {`We've sent a 6-digit code to your phone number ending in ${phoneNumber?.slice(-4)}. Please enter it below to continue.`}
            </Text>
            <Title order={4} ta="center" mt="xs" mb={'-0.5rem'}>
                Enter your code
            </Title>
            <OtpInput form={form} />
            <InputError error={form.errors.code} />
            <Button
                type="submit"
                w="100%"
                size="lg"
                variant="primary"
                radius="sm"
                mt="xs"
                loading={isVerifyingCode}
                disabled={!/\d{6,}/.test(form.values.code)}
            >
                Verify code
            </Button>
            <Group>
                <Text fz="sm" c="grey.7">
                    Didn’t receive a code?{' '}
                    <Anchor
                        component="button"
                        type="button"
                        c="blue.7"
                        fz="sm"
                        underline="always"
                        style={{ opacity: canResendCode ? 1 : 0.4, cursor: canResendCode ? 'pointer' : 'not-allowed' }}
                        disabled={!canResendCode}
                        onClick={resendCode}
                    >
                        Resend code
                    </Anchor>
                </Text>
            </Group>
        </>
    )
}
