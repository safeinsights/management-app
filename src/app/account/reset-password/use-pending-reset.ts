'use client'

import { useEffect } from 'react'
import { useForm, useMutation, useState, z, zodResolver } from '@/common'
import { errorToString, isClerkApiError } from '@/lib/errors'
import { onUserResetPWAction } from '@/server/actions/user.actions'
import { useSignIn } from '@clerk/nextjs'
import { sendPhoneCodeIfOnlyFactor, throwOnClerkError } from '../signin/logic'
import { useCompleteSignIn } from '../signin/use-complete-sign-in'
import { PASSWORD_REQUIREMENTS, usePasswordRequirements } from './password-requirements'

const RESEND_COOLDOWN_MS = 30000

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

export function usePendingReset(identifier: string | null) {
    const { signIn } = useSignIn()
    const [needsMFA, setNeedsMFA] = useState(false)
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
            setVerificationError(null)

            // A retry after a rejected password: the code is already spent and verified.
            if (signIn.status !== 'needs_new_password') {
                await throwOnClerkError(signIn.resetPasswordEmailCode.verifyCode({ code: form.code }))
            }
            // Clerk defaults this to true; the legacy reset left other sessions signed in.
            await throwOnClerkError(
                signIn.resetPasswordEmailCode.submitPassword({ password: form.password, signOutOfOtherSessions: false }),
            )
            return signIn.status
        },
        onError(error: unknown) {
            if (!isClerkApiError(error)) {
                verificationForm.setErrors({
                    code: errorToString(error),
                })
                return
            }

            const clerkErr = error.errors[0]

            if (clerkErr.code === 'form_code_incorrect') {
                setVerificationError('Incorrect verification code. Please try again.')
                return
            }

            verificationForm.setErrors({
                form: error as unknown as string,
            })
        },
        async onSuccess(status: string) {
            if (status == 'complete') {
                await throwOnClerkError(signIn.finalize())
                await onUserResetPWAction()
                // A reset hands back a live session, so the same post-sign-in sequence applies.
                await completeSignIn()
            } else if (status == 'needs_second_factor') {
                await sendPhoneCodeIfOnlyFactor(signIn)
                setNeedsMFA(true)
            } else {
                verificationForm.setErrors({
                    password: 'An unknown error occurred, please try again later.',
                })
            }
        },
    })

    const { mutate: resendCode, isPending: isResending } = useMutation({
        mutationFn: async () => {
            if (!identifier) {
                verificationForm.setFieldError('code', 'An unknown error occurred, please try again later.')
                return
            }

            await throwOnClerkError(signIn.resetPasswordEmailCode.sendCode())
        },
        onError: (error: unknown) => {
            console.error('Failed to resend code:', error)
        },
        onSuccess: () => {
            setCanResend(false)
        },
    })

    useEffect(() => {
        if (canResend) return
        const timer = setTimeout(() => setCanResend(true), RESEND_COOLDOWN_MS)
        return () => clearTimeout(timer)
    }, [canResend])

    const [passwordTouched, setPasswordTouched] = useState(false)
    const { requirementsDescription } = usePasswordRequirements(verificationForm.values.password, passwordTouched)

    return {
        needsMFA,
        verificationForm,
        verificationError,
        canResend,
        isPending,
        isResending,
        requirementsDescription,
        onSubmitVerification,
        resendCode: () => resendCode(),
        markPasswordTouched: () => setPasswordTouched(true),
    }
}
