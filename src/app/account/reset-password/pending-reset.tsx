'use client'

import { useState } from 'react'
import { Button, TextInput, Paper, PasswordInput, Title, Flex, Text, ThemeIcon } from '@mantine/core'
import { isNotEmpty, useForm } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { errorToString, extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { useMutation } from '@tanstack/react-query'
import { signInToMFAState, type MFAState } from '../signin/logic'
import { RequestMFA } from '../signin/mfa'
import { Check, X } from '@phosphor-icons/react'

interface VerificationFormValues {
    code: string
    password: string
    confirmPassword: string
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
            confirmPassword: '',
        },
        validate: {
            code: isNotEmpty('Verification code is required'),
            password: isNotEmpty('New password is required'),
            confirmPassword: (value, values) => (value !== values.password ? 'Passwords do not match' : null),
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

    const requirements = [
        { re: /[0-9]/, label: 'One number' },
        { re: /[A-Z]/, label: 'One uppercase letter' },
        { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: 'One special symbol' },
        { re: /^.{8,}$/, label: '8 character minimum' },
    ]

    const checkRequirements = (password: string) => {
        return requirements.map((requirement) => ({
            ...requirement,
            meets: requirement.re.test(password),
        }))
    }

    const passwordRequirements = checkRequirements(verificationForm.values.password)
    const allRequirementsMet = passwordRequirements.every((req) => req.meets)

    if (mfaSignIn) return <RequestMFA mfa={mfaSignIn} onReset={() => setNeedsMFA(false)} />

    return (
        <form onSubmit={verificationForm.onSubmit((values) => onSubmitVerification(values))}>
            <Paper shadow="none" p="xxl" radius="sm">
                <Flex direction="column" gap="sm">
                    <Title mb="sm" ta="center" order={3}>
                        Reset your password
                    </Title>
                    <TextInput
                        key={verificationForm.key('code')}
                        {...verificationForm.getInputProps('code')}
                        label="Enter verification code"
                        placeholder="A code has been sent to your registered email"
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

                    {verificationForm.values.password && (
                        <Paper>
                            <Flex direction="column" gap="xs">
                                {[0, 2].map((rowStart) => (
                                    <Flex key={rowStart} direction="row" gap="md">
                                        {passwordRequirements
                                            .slice(rowStart, rowStart + 2)
                                            .map((requirement, index) => (
                                                <Flex
                                                    key={rowStart + index}
                                                    align="center"
                                                    gap="xs"
                                                    style={{ flex: 1 }}
                                                >
                                                    <ThemeIcon
                                                        color={requirement.meets ? 'teal' : 'red'}
                                                        size={16}
                                                        radius="xl"
                                                    >
                                                        {requirement.meets ? <Check size={12} /> : <X size={12} />}
                                                    </ThemeIcon>
                                                    <Text size="sm">{requirement.label}</Text>
                                                </Flex>
                                            ))}
                                    </Flex>
                                ))}
                            </Flex>
                        </Paper>
                    )}

                    <PasswordInput
                        key={verificationForm.key('confirmPassword')}
                        {...verificationForm.getInputProps('confirmPassword')}
                        label="Confirm New Password"
                        placeholder="********"
                        aria-label="Confirm New password"
                        mt={10}
                    />
                    <Flex direction="row" justify="space-between" mt={15} mb="xxl">
                        <Button type="submit" loading={isPending} variant="outline">
                            Resend verification code
                        </Button>
                        <Button
                            type="submit"
                            loading={isPending}
                            disabled={!verificationForm.isValid() || !allRequirementsMet}
                        >
                            Update new password
                        </Button>
                    </Flex>
                </Flex>
            </Paper>
        </form>
    )
}
