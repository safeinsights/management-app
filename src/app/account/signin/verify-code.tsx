import { SignInResource } from '@clerk/types'
import { Stack, Title } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { SmsVerification } from './sms-verification'
import { TotpVerification } from './totp-verification'

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
    return (
        <form onSubmit={form.onSubmit(onSubmit)} style={{ width: '100%' }}>
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
        </form>
    )
}
