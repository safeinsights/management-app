'use client'

import { useState } from 'react'
import { Button, TextInput, Paper, PasswordInput, Title, Flex } from '@mantine/core'
import { useForm } from '@mantine/form'
import { zod4Resolver } from 'mantine-form-zod-resolver'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { errorToString, isClerkApiError } from '@/lib/errors'
import { useMutation } from '@tanstack/react-query'
import { signInToMFAState, type MFAState } from '../signin/logic'
import { RequestMFA } from '../signin/mfa'
import { PASSWORD_REQUIREMENTS, Requirements } from './password-requirements'
import { z } from 'zod'

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
    const searchParams = useSearchParams()

    const verificationForm = useForm<VerificationFormValues>({
        initialValues: {
            code: '',
            password: '',
            confirmPassword: '',
        },
        validate: zod4Resolver(verificationFormSchema),
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
                verificationForm.setFieldError(
                    'code',
                    errorToString(error, { form_code_incorrect: 'Incorrect Verification Code.' }),
                )
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
                const redirectUrl = searchParams.get('redirect_url')
                router.push(redirectUrl || '/')
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

                    {verificationForm.values.password && <Requirements requirements={passwordRequirements} />}

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
                        <Button type="submit" loading={isPending} disabled={!verificationForm.isValid()}>
                            Update new password
                        </Button>
                    </Flex>
                </Flex>
            </Paper>
        </form>
    )
}
