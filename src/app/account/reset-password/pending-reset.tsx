'use client'

import { useForm, useMutation, useState, z, zodResolver } from '@/components/common'
import { InputError } from '@/components/errors'
import { errorToString, isClerkApiError } from '@/lib/errors'
import { onUserResetPWAction } from '@/server/actions/user.actions'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { Button, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { useRouter, useSearchParams } from 'next/navigation'
import { signInToMFAState, type MFAState } from '../signin/logic'
import { RequestMFA } from '../signin/mfa'
import { PASSWORD_REQUIREMENTS, Requirements } from './password-requirements'

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
    const { isLoaded, setActive, signIn } = useSignIn()
    const [mfaSignIn, setNeedsMFA] = useState<MFAState>(false)
    const [verificationError, setVerificationError] = useState<string | null>(null)
    const [canResend, setCanResend] = useState(true)
    const router = useRouter()
    const searchParams = useSearchParams()

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
            if (!isLoaded || !pendingReset || Object.keys(pendingReset).length === 0) return
            setVerificationError(null)

            return await pendingReset.attemptFirstFactor({
                strategy: 'reset_password_email_code',
                code: form.code,
                password: form.password,
            })
        },
        onError(error: unknown) {
            if (isClerkApiError(error)) {
                setVerificationError(
                    errorToString(error, { form_code_incorrect: 'Incorrect verification code. Please try again.' }),
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
                await onUserResetPWAction()
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

    const { mutate: resendCode, isPending: isResending } = useMutation({
        mutationFn: async () => {
            if (!pendingReset || !signIn) return
            const identifier = pendingReset.identifier
            if (!identifier) {
                // email account not found
                verificationForm.setFieldError('code', 'An unknown error occurred, please try again later.')
                return
            }

            return await signIn.create({
                strategy: 'reset_password_email_code',
                identifier,
            })
        },
        onError: (error: unknown) => {
            console.error('Failed to resend code:', error)
        },
        onSuccess: () => {
            setCanResend(false)
            setTimeout(() => setCanResend(true), 30000)
        },
    })

    const handleResend = () => {
        resendCode()
    }

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
                <Stack gap="xs" mb="xxl">
                    <Title mb="md" ta="center" order={3}>
                        Reset your password
                    </Title>
                    <TextInput
                        key={verificationForm.key('code')}
                        {...verificationForm.getInputProps('code')}
                        label="Enter verification code"
                        placeholder="A code has been sent to your registered email"
                        aria-label="Verification code"
                    />
                    {verificationError && <InputError error={verificationError} />}
                    <Button
                        variant="subtle"
                        c={canResend ? 'blue.7' : 'gray.5'}
                        fw={600}
                        size="xs"
                        loading={isResending}
                        onClick={handleResend}
                        disabled={isResending || !canResend}
                        styles={{
                            root: {
                                width: 'fit-content',
                                background: 'transparent',
                                padding: 0,
                            },
                        }}
                    >
                        Resend verification code
                    </Button>
                    <PasswordInput
                        key={verificationForm.key('password')}
                        {...verificationForm.getInputProps('password')}
                        label="Enter new password"
                        placeholder="********"
                        aria-label="New password"
                        mb="xs"
                    />

                    {verificationForm.values.password && <Requirements requirements={passwordRequirements} />}

                    <PasswordInput
                        key={verificationForm.key('confirmPassword')}
                        {...verificationForm.getInputProps('confirmPassword')}
                        label="Confirm new password"
                        placeholder="********"
                        aria-label="Confirm New password"
                        mb="md"
                    />
                    <Button type="submit" size="lg" loading={isPending} disabled={!verificationForm.isValid()}>
                        Update new password
                    </Button>
                </Stack>
            </Paper>
        </form>
    )
}
