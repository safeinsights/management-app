'use client'

import { useState } from 'react'
import { Button, TextInput, Paper, PasswordInput, Title, Flex, Text, ThemeIcon } from '@mantine/core'
import { useForm, zodResolver } from '@mantine/form'
import { useRouter } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { errorToString, extractClerkCodeAndMessage, isClerkApiError } from '@/lib/errors'
import { useMutation } from '@tanstack/react-query'
import { signInToMFAState, type MFAState } from '../signin/logic'
import { RequestMFA } from '../signin/mfa'
import { Check, X } from '@phosphor-icons/react'
import { z } from 'zod'

const PASSWORD_REQUIREMENTS = [
    { re: /[0-9]/, label: 'One number', message: 'Password must contain at least one number' },
    { re: /[A-Z]/, label: 'One uppercase letter', message: 'Password must contain at least one uppercase letter' },
    {
        re: /[$&+,:;=?@#|'<>.^*()%!-]/,
        label: 'One special symbol',
        message: 'Password must contain at least one special symbol',
    },
    { re: /^.{8,}$/, label: '8 character minimum', message: '8 character minimum' },
] as const

const createPasswordSchema = () => {
    let schema = z.string()

    PASSWORD_REQUIREMENTS.forEach((req) => {
        schema = schema.regex(req.re, req.message)
    })

    return schema
}

const verificationFormSchema = z
    .object({
        code: z.string().min(1, 'Verification code is required'),
        password: createPasswordSchema(),
        confirmPassword: z.string().min(1, 'Password confirmation is required'),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    })

type VerificationFormValues = z.infer<typeof verificationFormSchema>

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
        validate: zodResolver(verificationFormSchema),
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

    const checkRequirements = (password: string) => {
        return PASSWORD_REQUIREMENTS.map((requirement) => ({
            ...requirement,
            meets: requirement.re.test(password),
        }))
    }

    const passwordRequirements = checkRequirements(verificationForm.values.password)
    const allRequirementsMet = passwordRequirements.every((req) => req.meets)

    const renderRequirementRows = () => {
        const rows = []
        for (let i = 0; i < passwordRequirements.length; i += 2) {
            rows.push(
                <Flex key={i} direction="row" gap="md">
                    {passwordRequirements.slice(i, i + 2).map((requirement, index) => (
                        <Flex key={i + index} align="center" gap="xs" style={{ flex: 1 }}>
                            <ThemeIcon color={requirement.meets ? 'teal' : 'red'} size={16} radius="xl">
                                {requirement.meets ? <Check size={12} /> : <X size={12} />}
                            </ThemeIcon>
                            <Text size="sm">{requirement.label}</Text>
                        </Flex>
                    ))}
                </Flex>,
            )
        }
        return rows
    }

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
                                {renderRequirementRows()}
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
