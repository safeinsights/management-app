'use client'

import { useState } from 'react'
import { reportError } from './errors'
import { Anchor, Button, Group, Loader, Stack, Text, TextInput, Paper, CloseButton, PasswordInput } from '@mantine/core'
import { isEmail, isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'

interface ResetPasswordFormValues {
    email: string
}

interface VerificationFormValues {
    code: string
    password: string
}

export function ResetPassword() {
    const { isLoaded, signIn, setActive } = useSignIn()
    const [pendingReset, setPendingReset] = useState<ReturnType<typeof signIn.create> | null>(null)
    const router = useRouter()

    const emailForm = useForm<ResetPasswordFormValues>({
        initialValues: {
            email: '',
        },
        validate: {
            email: isEmail('Invalid email'),
        },
    })

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

    if (!isLoaded) {
        return <Loader />
    }

    const onSubmitEmail = async (values: ResetPasswordFormValues) => {
        if (!isLoaded) return

        try {
            const reset = await signIn.create({
                strategy: 'reset_password_email_code',
                identifier: values.email,
            })
            setPendingReset(reset)
        } catch (err) {
            reportError(err, 'failed to initiate password reset')

            const emailError = err.errors?.find((error) => error.meta?.paramName === 'email_address')
            if (emailError) {
                emailForm.setFieldError('email', emailError.longMessage)
            }
        }
    }

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

    if (pendingReset) {
        return (
            <Stack>
                <form onSubmit={verificationForm.onSubmit((values) => onSubmitVerification(values))}>
                    <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                        <Group justify="space-between" gap="xl">
                            <Text ta="left">Reset Your Password</Text>
                            <CloseButton aria-label="Close form" onClick={() => router.push('/')} />
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
                            <Anchor onClick={() => setPendingReset(null)}>Back to Email Entry</Anchor>
                        </Stack>
                    </Paper>
                </form>
            </Stack>
        )
    }

    return (
        <Stack>
            <form onSubmit={emailForm.onSubmit((values) => onSubmitEmail(values))}>
                <Paper bg="#d3d3d3" shadow="none" p={10} mt={30} radius="sm">
                    <Group justify="space-between" gap="xl">
                        <Text ta="left">Reset Password</Text>
                        <CloseButton aria-label="Close form" onClick={() => router.push('/')} />
                    </Group>
                </Paper>
                <Paper bg="#f5f5f5" shadow="none" p={30} radius="sm">
                    <Text>Enter your email address and we&#39;ll send you a verification code.</Text>
                    <TextInput
                        key={emailForm.key('email')}
                        {...emailForm.getInputProps('email')}
                        label="Email"
                        placeholder="Email address"
                        aria-label="Email address"
                    />
                    <Stack align="center" mt={15}>
                        <Button type="submit">Send Reset Code</Button>
                        <Anchor onClick={() => router.push('/')}>Back to Login</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
