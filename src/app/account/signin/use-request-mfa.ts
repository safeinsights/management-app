'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useSignIn } from '@clerk/nextjs/legacy'
import type { SignInResource } from '@clerk/nextjs/types'
import { isNotEmpty } from '@mantine/form'
import { useForm, useMutation } from '@/common'
import { errorToString } from '@/lib/errors'
import type { MFAState } from './logic'
import { useCompleteSignIn } from './use-complete-sign-in'

export type Step = 'select' | 'verify' | 'recovery'
export type Method = 'sms' | 'totp'

export function useRequestMfa(mfa: MFAState) {
    const [step, setStep] = useState<Step>('select')
    const [method, setMethod] = useState<Method | null>(null)
    const { isLoaded, setActive } = useSignIn()
    const { isSignedIn } = useUser()
    const completeSignIn = useCompleteSignIn()

    const factors = mfa ? (mfa.signIn.supportedSecondFactors ?? []) : []
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
            if (!isLoaded || !mfa) return
            const strategy = method === 'sms' ? 'phone_code' : 'totp'
            return await mfa.signIn.attemptSecondFactor({
                strategy,
                code: form.code,
            })
        },
        onError(error: unknown) {
            form.setErrors({
                code: errorToString(error, {
                    clerkOverrides: { form_code_incorrect: 'Invalid verification code. Please try again.' },
                }),
            })
        },
        async onSuccess(signInAttempt?: SignInResource) {
            if (signInAttempt?.status === 'complete' && setActive) {
                await setActive({ session: signInAttempt.createdSessionId })
                await completeSignIn()
            } else {
                form.setErrors({
                    code: `Unknown signIn status: ${signInAttempt?.status || 'unknown'}`,
                })
            }
        },
    })

    const onSelectMethod = async (method: Method) => {
        if (!mfa || !isLoaded) return

        if (mfa.signIn.status === 'needs_second_factor' && method === 'sms') {
            try {
                await mfa.signIn.prepareSecondFactor({ strategy: 'phone_code' })
            } catch (err) {
                console.error('Error preparing second factor', err)
            }
        }

        setMethod(method)
        setStep('verify')
    }

    const resetFlow = async () => {
        if (mfa && mfa.signIn) {
            await mfa.signIn.reload()
            setMethod(null)
            setStep('select')
            form.setFieldValue('code', '')
            form.clearErrors()
        }
    }

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
        maskedPhone,
    }
}
