'use client'

import { useEffect } from 'react'
import { useForm, useMutation, useState, z, zodResolver } from '@/common'
import { errorToString, isClerkApiError } from '@/lib/errors'
import { onUserResetPWAction } from '@/server/actions/user.actions'
import { useSignIn } from '@clerk/nextjs/legacy'
import type { SignInResource } from '@clerk/nextjs/types'
import { signInToMFAState, type MFAState } from '../signin/logic'
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

export function usePendingReset(pendingReset: SignInResource, onResetUpdate?: (updated: SignInResource) => void) {
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

            if (clerkErr.code === 'form_code_incorrect') {
                setVerificationError('Incorrect verification code. Please try again.')
                return
            }

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
            if (newSignIn && onResetUpdate) {
                onResetUpdate(newSignIn)
            }

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
