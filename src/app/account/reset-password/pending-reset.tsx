'use client'

import { useState } from 'react'
import { Button, TextInput, Paper, PasswordInput, Title, Flex } from '@mantine/core'
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
}

export function PendingReset({ pendingReset }: PendingResetProps) {
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
                    [`${code == 'verification_expired' || code == 'form_code_incorrect' ? 'code' : 'password'}`]:
                        message == 'Incorrect code' ? 'Incorrect Verification Code' : message,
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
        <form onSubmit={verificationForm.onSubmit((values) => onSubmitVerification(values))}>
            <Paper bg="#f5f5f5" shadow="none" p="xxl" radius="sm">
                <Flex direction="column" gap="sm">
                    <Title mb="sm" ta="center" order={3}>
                        Reset your password
                    </Title>
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
                        placeholder="********"
                        aria-label="New password"
                        mt={10}
                    />
                    <PasswordInput
                        key={verificationForm.key('password')}
                        {...verificationForm.getInputProps('password')}
                        label="Confirm New Password"
                        placeholder="********"
                        aria-label="Confirm New password"
                        mt={10}
                    />
                    <Flex direction="row" justify="space-between" mt={15} mb="xxl" gap="xxl">
                        <Button type="submit" loading={isPending} variant="outline">
                            Resend verification code
                        </Button>
                        <Button type="submit" loading={isPending}>
                            Update new password
                        </Button>
                    </Flex>
                </Flex>
            </Paper>
        </form>
    )
}
