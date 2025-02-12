import { type SignInResource } from '@clerk/types'

export type MFAState = false | { usingSMS: boolean; signIn: SignInResource }

export const isUsingPhoneMFA = (signIn: SignInResource) => {
    return Boolean(
        signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'phone_code') &&
            !signIn.supportedSecondFactors?.find((sf) => sf.strategy == 'totp'),
    )
}
