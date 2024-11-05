'use client'

import { Button, Group, Stack, Text, TextInput, Paper, CloseButton, PasswordInput, Anchor } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import { reportError } from '../errors'

interface VerificationFormValues {
    code: string
    password: string
}

interface PendingResetProps {
    pendingReset: ReturnType<typeof signIn.create>
    onBack: () => void
}

export function PendingReset({ pendingReset, onBack }: PendingResetProps) {
    const { isLoaded, setActive } = useSignIn()
    const router = useRouter()

    const verificationForm = useForm<VerificationFormValues>({
        initialValues: {
            code: '',
            password: '',
        },
        validate: {
            code: isNotEmpty('Verification code is required'),
            password: isNotEmpty('New password is required'),
        },
    })

    const onSubmitVerification = async (values: VerificationFormValues) => {
        if (!isLoaded || !pendingReset) return

        try {
            const result = await pendingReset.attemptFirstFactor({
                strategy: 'reset_password_email_code',
                code: values.code,
                password: values.password,
            })

            if (result.status === 'complete') {
                await setActive({ session: result.createdSessionId })
                router.push('/')
            }
        } catch (err) {
            reportError(err, 'failed to reset password')

            const codeError = err.errors?.find((error) => error.meta?.paramName === 'code')
            if (codeError) {
                verificationForm.setFieldError('code', codeError.longMessage)
            }

            const passwordError = err.errors?.find((error) => error.meta?.paramName === 'password')
            if (passwordError) {
                verificationForm.setFieldError('password', passwordError.longMessage)
            }
        }
    }

    return (
        <Stack>
            <form onSubmit={verificationForm.onSubmit((values) => onSubmitVerification(values))}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Reset Your Password</Text>
                        <CloseButton aria-label="Close password reset form" onClick={() => router.push('/')} />
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <Text>Enter the verification code from your email and choose a new password.</Text>
                    <TextInput
                        key={verificationForm.key('code')}
                        {...verificationForm.getInputProps('code')}
                        label="Verification Code"
                        placeholder="Enter code from email"
                        aria-label="Verification code"
                    />
                    <PasswordInput
                        key={verificationForm.key('password')}
                        {...verificationForm.getInputProps('password')}
                        label="New Password"
                        placeholder="Enter new password"
                        aria-label="New password"
                        mt={10}
                    />
                    <Stack align="center" mt={15}>
                        <Button type="submit">Reset Password</Button>
                        <Anchor onClick={onBack}>Back to Email Entry</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
