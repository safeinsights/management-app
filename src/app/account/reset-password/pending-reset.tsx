'use client'

import { useForm, useMutation, useState, z, zodResolver } from '@/common'
import { ClerkErrorAlert } from '@/components/clerk-errors'
import { InputError } from '@/components/errors'
import { errorToString, isClerkApiError } from '@/lib/errors'
import { onUserResetPWAction } from '@/server/actions/user.actions'
import { useSignIn } from '@clerk/nextjs'
import type { SignInResource } from '@clerk/types'
import { Button, Paper, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { signInToMFAState, type MFAState } from '../signin/logic'
import { RequestMFA } from '../signin/mfa'
import { useCompleteSignIn } from '../signin/use-complete-sign-in'
import { PASSWORD_REQUIREMENTS, usePasswordRequirements } from './password-requirements'

const verificationFormSchema = z
    .object({
        code: z.string().min(1, 'Verification code is required'),
        password: (() => {
            let schema = z.string().max(64)
            PASSWORD_REQUIREMENTS.forEach((req) => {
                schema = schema.regex(req.re, req.message)
            })
            return schema
        })(),
        confirmPassword: z.string(),
    })
    .superRefine(({ confirmPassword, password }, ctx) => {
        if (confirmPassword !== password) {
            ctx.addIssue({
                code: 'custom',
                message: 'Passwords do not match. Please re-enter them.',
                path: ['confirmPassword'],
            })
        }
    })

type VerificationFormValues = z.infer<typeof verificationFormSchema>

interface PendingResetProps {
    pendingReset: SignInResource
    onResetUpdate?: (updated: SignInResource) => void
}

export function PendingReset({ pendingReset, onResetUpdate }: PendingResetProps) {
    const { isLoaded, setActive, signIn } = useSignIn()
    const [needsMFA, setNeedsMFA] = useState<MFAState>(false)
    const completeSignIn = useCompleteSignIn()
    const [verificationError, setVerificationError] = useState<string | null>(null)
    const [canResend, setCanResend] = useState(true)

    const verificationForm = useForm<VerificationFormValues>({
        validate: zodResolver(verificationFormSchema),
        validateInputOnBlur: true,
        validateInputOnChange: ['password'],
        initialValues: {
            code: '',
            password: '',
            confirmPassword: '',
        },
    })

    const { isPending, mutate: onSubmitVerification } = useMutation({
        async mutationFn(form: VerificationFormValues) {
            if (!isLoaded || (!signIn && (!pendingReset || Object.keys(pendingReset).length === 0))) return
            setVerificationError(null)

            const resetInstance = signIn ?? pendingReset

            return await resetInstance!.attemptFirstFactor({
                strategy: 'reset_password_email_code',
                code: form.code,
                password: form.password,
            })
        },
        onError(error: unknown) {
            if (!isClerkApiError(error)) {
                verificationForm.setErrors({
                    code: errorToString(error),
                })
                return
            }

            const clerkErr = error.errors[0]

            // If the verification code is incorrect, show inline error instead of alert
            if (clerkErr.code === 'form_code_incorrect') {
                setVerificationError('Incorrect verification code. Please try again.')
                return
            }

            // Clerk error, show alert (e.g. too many attempts/compromised password)
            verificationForm.setErrors({
                form: error as unknown as string,
            })
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
                // A reset hands back a live session, so the same post-sign-in sequence applies.
                await completeSignIn()
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
        onSuccess: (newSignIn) => {
            // use the latest sign-in instance
            if (newSignIn && onResetUpdate) {
                onResetUpdate(newSignIn)
            }

            setCanResend(false)
            setTimeout(() => setCanResend(true), 30000)
        },
    })

    const handleResend = () => {
        resendCode()
    }

    const [passwordTouched, setPasswordTouched] = useState(false)
    const { requirementsDescription } = usePasswordRequirements(verificationForm.values.password, passwordTouched)

    if (needsMFA) return <RequestMFA mfa={needsMFA} />

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
                        onBlur={(event) => {
                            verificationForm.getInputProps('password').onBlur?.(event)
                            setPasswordTouched(true)
                        }}
                        label="Enter new password"
                        placeholder="********"
                        aria-label="New password"
                        mb="xs"
                        // Error is suppressed in favor of the requirements list below, which
                        // now also appears when the field is left empty.
                        error={undefined}
                        aria-invalid={!!verificationForm.errors.password || undefined}
                        // Rendered as the input's description so Mantine owns the
                        // aria-describedby wiring; a hand-passed value is overwritten.
                        description={requirementsDescription}
                        // Description below the input, not Mantine's default position above it:
                        // this is live validation feedback, and it sat under the field before.
                        inputWrapperOrder={['label', 'input', 'description', 'error']}
                    />

                    <PasswordInput
                        key={verificationForm.key('confirmPassword')}
                        {...verificationForm.getInputProps('confirmPassword')}
                        label="Confirm new password"
                        placeholder="********"
                        aria-label="Confirm New password"
                        mb="md"
                        error={
                            verificationForm.errors.confirmPassword && (
                                <InputError error={verificationForm.errors.confirmPassword} />
                            )
                        }
                        // PasswordInput's inner <input> is rendered with withAria disabled, so
                        // `error` alone never marks it invalid to assistive tech (OTTER-647).
                        aria-invalid={!!verificationForm.errors.confirmPassword || undefined}
                    />
                    <ClerkErrorAlert
                        onClose={() => verificationForm.clearFieldError('form')}
                        error={verificationForm.errors.form}
                    />
                    <Button type="submit" size="lg" loading={isPending} disabled={!verificationForm.isValid()}>
                        Update password
                    </Button>
                </Stack>
            </Paper>
        </form>
    )
}
