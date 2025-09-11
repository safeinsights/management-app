import { InputError } from '@/components/errors'
import { SignInResource } from '@clerk/types'
import { Anchor, Button, Group, PinInput, Stack, Text, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { CaretLeftIcon } from '@phosphor-icons/react'
import { useState } from 'react'

interface VerifyCodeProps {
    signIn: SignInResource | null
    phoneNumber?: string // masked phone number
    form: UseFormReturnType<{ code: string }>
    isVerifyingCode: boolean
    method: 'sms' | 'totp'
    onSubmit: (values: { code: string }) => void
    resetFlow: () => void
}

export const VerifyCode = ({
    signIn,
    phoneNumber,
    form,
    isVerifyingCode,
    method,
    onSubmit,
    resetFlow,
}: VerifyCodeProps) => {
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
        } catch (err) {
            console.error('Error preparing second factor', err)
        }
    }

    return (
        <form onSubmit={form.onSubmit(onSubmit)} style={{ width: '100%' }}>
            <Stack align="center" gap="md" mb="xl">
                <Title order={3} mb="xs">
                    Verify your code
                </Title>
                <Text>
                    {method === 'sms'
                        ? `We've sent a 6-digit code to your phone number ending in
                        ${phoneNumber?.slice(-4)}. Please enter it below to continue.`
                        : `Open your authenticator app and enter the 6-digit code generated for your account.`}
                </Text>
                {method === 'totp' && (
                    <Text>This code changes every 30 seconds and helps ensure your account remains secure.</Text>
                )}
                <Title order={4} ta="center" mt="xs" mb={'-0.5rem'}>
                    Enter your code
                </Title>
                <PinInput
                    length={6}
                    placeholder="0"
                    size="lg"
                    type="number"
                    data-testid="sms-pin-input"
                    error={!!form.errors.code}
                    {...form.getInputProps('code')}
                />
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
                {method === 'sms' && (
                    <Group>
                        <Text fz="sm" c="grey.7">
                            Didn’t receive a code?{' '}
                            <Anchor
                                component="button"
                                c="blue.7"
                                fz="sm"
                                underline="always"
                                style={{
                                    opacity: canResendCode ? 1 : 0.4,
                                    cursor: canResendCode ? 'pointer' : 'not-allowed',
                                }}
                                disabled={!canResendCode}
                                onClick={resendCode}
                            >
                                Resend code
                            </Anchor>
                        </Text>
                    </Group>
                )}
                {method === 'totp' && (
                    <Group gap="xs" justify="center">
                        <Button onClick={resetFlow} mt="md" fw={600} fz="md" variant="subtle">
                            <CaretLeftIcon size={20} />
                            Back to options
                        </Button>
                    </Group>
                )}
            </Stack>
        </form>
    )
}
