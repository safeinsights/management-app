import type { SignInFutureResource } from '@clerk/nextjs/types'

// True while the shared signals sign-in waits for its second factor.
export type MFAState = boolean

export const isUsingPhoneMFA = (signIn: Pick<SignInFutureResource, 'supportedSecondFactors'>) => {
    return Boolean(
        signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'phone_code') &&
        !signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'totp'),
    )
}

// Signals methods return their error instead of throwing; rethrowing keeps the existing catch paths.
export const throwOnClerkError = async (call: Promise<{ error: unknown }>) => {
    const { error } = await call
    if (error) throw error
}

export const sendPhoneCodeIfOnlyFactor = async (signIn: SignInFutureResource) => {
    if (isUsingPhoneMFA(signIn)) {
        await throwOnClerkError(signIn.mfa.sendPhoneCode())
    }
}
