'use client'

import { useSession } from '@clerk/nextjs'
import { Routes } from '@/lib/routes'
import { hasVerifiedSecondFactor } from '@/lib/second-factor'

export const SIGN_IN_TO_VERIFY_MFA = `${Routes.accountSignin}?mfa=verify`

// Enrolling a factor does not verify the session it happened in, and the proxy refuses an unverified
// session, so a user who just set up MFA signs in again with it.
export function useSessionNeedsSecondFactor() {
    const { session } = useSession()
    return session ? !hasVerifiedSecondFactor(session.factorVerificationAge) : false
}
