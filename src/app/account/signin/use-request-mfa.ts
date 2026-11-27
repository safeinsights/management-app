'use client'

import { useState } from 'react'
import { useAuth, useSignIn, useUser } from '@clerk/nextjs'
import { isNotEmpty } from '@mantine/form'
import { useForm, useMutation } from '@/common'
import { errorToString } from '@/lib/errors'
import { throwOnClerkError, type MFAState } from './logic'
import { useCompleteSignIn } from './use-complete-sign-in'

export type Step = 'select' | 'verify' | 'recovery'
export type Method = 'sms' | 'totp'

export function useRequestMfa(mfa: MFAState) {
    const [step, setStep] = useState<Step>('select')
    const [method, setMethod] = useState<Method | null>(null)
    const { signIn } = useSignIn()
    const { isLoaded } = useAuth()
    const { isSignedIn } = useUser()
    const completeSignIn = useCompleteSignIn()

    const factors = mfa ? (signIn.supportedSecondFactors ?? []) : []
    const hasSMS = factors.some((sf) => sf.strategy === 'phone_code')
    const hasTOTP = factors.some((sf) => sf.strategy === 'totp')

    const form = useForm({
        initialValues: {
            code: '',
        },

        validate: {
            code: isNotEmpty('Required'),
        },
    })

    const { isPending, mutate: onMFASubmit } = useMutation({
        async mutationFn(form: { code: string }) {
            if (!mfa) return
            const { code } = form
            await throwOnClerkError(
                method === 'sms' ? signIn.mfa.verifyPhoneCode({ code }) : signIn.mfa.verifyTOTP({ code }),
            )
            return signIn.status
        },
        onError(error: unknown) {
            form.setErrors({
                code: errorToString(error, {
                    clerkOverrides: { form_code_incorrect: 'Invalid verification code. Please try again.' },
                }),
            })
        },
        async onSuccess(status?: string) {
            if (status === 'complete') {
                await throwOnClerkError(signIn.finalize())
                await completeSignIn()
            } else {
                form.setErrors({
                    code: `Unknown signIn status: ${status || 'unknown'}`,
                })
            }
        },
    })

    const onSelectMethod = async (method: Method) => {
        if (!mfa || !isLoaded) return

        if (signIn.status === 'needs_second_factor' && method === 'sms') {
            try {
                await throwOnClerkError(signIn.mfa.sendPhoneCode())
            } catch (err) {
                console.error('Error preparing second factor', err)
            }
        }

        setMethod(method)
        setStep('verify')
    }

    const resetFlow = () => {
        if (mfa) {
            setMethod(null)
            setStep('select')
            form.setFieldValue('code', '')
            form.clearErrors()
        }
    }

    const resendSmsCode = () => throwOnClerkError(signIn.mfa.sendPhoneCode())

    // Clerk masks the phone number during MFA sign-in.
    const maskedPhone = method === 'sms' ? factors.find((f) => f.strategy === 'phone_code')?.safeIdentifier : undefined

    return {
        isHidden: Boolean(isSignedIn) || !mfa,
        isLoaded,
        step,
        setStep,
        method,
        hasSMS,
        hasTOTP,
        form,
        isPending,
        onMFASubmit,
        onSelectMethod,
        resetFlow,
        resendSmsCode,
        maskedPhone,
    }
}
