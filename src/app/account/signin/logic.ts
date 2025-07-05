import { type SignInResource } from '@clerk/types'

export type MFAState = false | { usingSMS: boolean; signIn: SignInResource }

export const isUsingPhoneMFA = (signIn: SignInResource) => {
    return Boolean(
        signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'phone_code') &&
            !signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'totp'),
    )
}

export const signInToMFAState = async (attempt: SignInResource): Promise<MFAState> => {
    const usingSMS = isUsingPhoneMFA(attempt)
    if (usingSMS) {
        await attempt.prepareSecondFactor({ strategy: 'phone_code' })
    }
    return { signIn: attempt, usingSMS }
}
