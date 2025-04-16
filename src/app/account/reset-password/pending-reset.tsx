'use client'

import { useState } from 'react'
import { Button, Group, Stack, Text, TextInput, Paper, CloseButton, PasswordInput, Anchor } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { errorToString, extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { useMutation } from '@tanstack/react-query'
import { signInToMFAState, type MFAState } from '../signin/logic'
import { RequestMFA } from '../signin/mfa'

interface VerificationFormValues {
    code: string
    password: string
}

interface PendingResetProps {
    pendingReset: SignInResource
    onBack: () => void
}

export function PendingReset({ pendingReset, onBack }: PendingResetProps) {
    const { isLoaded, setActive } = useSignIn()
    const [mfaSignIn, setNeedsMFA] = useState<MFAState>(false)
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

    const { isPending, mutate: onSubmitVerification } = useMutation({
        async mutationFn(form: VerificationFormValues) {
            if (!isLoaded || !pendingReset) return

            return await pendingReset.attemptFirstFactor({
                strategy: 'reset_password_email_code',
                code: form.code,
                password: form.password,
            })
        },
        onError(error: unknown) {
            if (isClerkApiError(error)) {
                const { code, message } = extractClerkCodeAndMessage(error)
                verificationForm.setErrors({
                    // clerk seems to send verification_expired for all code verification errors
                    [`${code == 'verification_expired' ? 'code' : 'password'}`]: message,
                })
            } else {
                verificationForm.setErrors({
                    code: errorToString(error),
                })
            }
        },
        async onSuccess(info?: SignInResource) {
            if (!setActive || !info) {
                verificationForm.setErrors({
                    password: 'An unknown error occurred, please try again later.',
                })
                return
            }

            if (info.status == 'complete') {
                await setActive({ session: info.createdSessionId })
                router.push('/')
            } else if (info.status == 'needs_second_factor') {
                const state = await signInToMFAState(info)
                setNeedsMFA(state)
            } else {
                // clerk did not throw an error but also did not return a signIn object
                verificationForm.setErrors({
                    password: 'An unknown error occurred, please try again later.',
                })
            }
        },
    })

    if (mfaSignIn) return <RequestMFA mfa={mfaSignIn} onReset={() => setNeedsMFA(false)} />

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
                        <Button type="submit" loading={isPending}>
                            Reset Password
                        </Button>
                        <Anchor onClick={onBack}>Back to Email Entry</Anchor>
                    </Stack>
                </Paper>
            </form>
        </Stack>
    )
}
