import { SignInResource } from '@clerk/nextjs/types'
import { Box, Stack, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { SmsVerification } from './sms-verification'
import { TotpVerification } from './totp-verification'

interface VerifyCodeProps {
    isVisible: boolean
    signIn: SignInResource | null
    phoneNumber?: string // masked phone number
    form: UseFormReturnType<{ code: string }>
    isVerifyingCode: boolean
    method: 'sms' | 'totp' | null
    onSubmit: (values: { code: string }) => void
    resetFlow: () => void
}

export const VerifyCode = ({
    isVisible,
    signIn,
    phoneNumber,
    form,
    isVerifyingCode,
    method,
    onSubmit,
    resetFlow,
}: VerifyCodeProps) => {
    if (!isVisible || !method) return null

    return (
        <Box component="form" onSubmit={form.onSubmit(onSubmit)} w="100%">
            <Stack align="center" gap="md" mb="xl">
                <Title order={3} mb="xs">
                    Verify your code
                </Title>
                {method === 'sms' ? (
                    <SmsVerification
                        signIn={signIn}
                        phoneNumber={phoneNumber}
                        form={form}
                        isVerifyingCode={isVerifyingCode}
                    />
                ) : (
                    <TotpVerification form={form} isVerifyingCode={isVerifyingCode} resetFlow={resetFlow} />
                )}
            </Stack>
        </Box>
    )
}
