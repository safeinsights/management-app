'use client'

import { useEffect, useEffectEvent } from 'react'
import { useSignOut } from '@/hooks/use-sign-out'
import { ManageMFAView } from './manage-mfa-view'
import { useRequireUser } from './use-require-user'
import { SIGN_IN_TO_VERIFY_MFA, useSessionNeedsSecondFactor } from './use-session-needs-second-factor'

function useManageMfa() {
    const { user } = useRequireUser()
    const needsSecondFactor = useSessionNeedsSecondFactor()
    const signOut = useSignOut({ redirectAfterSignOut: SIGN_IN_TO_VERIFY_MFA })
    const userId = user?.id

    // Picks up a factor enrolled on another page; Clerk's cached user would still say "no MFA".
    const reloadUser = useEffectEvent(() => void user?.reload())
    useEffect(() => {
        if (userId) reloadUser()
    }, [userId])

    const hasMFA = Boolean(user?.twoFactorEnabled && !window.location.search.includes('TESTING_FORCE_NO_MFA'))
    const mustSignInAgain = hasMFA && needsSecondFactor

    const signInAgain = useEffectEvent(() => void signOut())
    useEffect(() => {
        if (mustSignInAgain) signInAgain()
    }, [mustSignInAgain])

    if (!user || mustSignInAgain) return null
    return hasMFA
}

export function ManageMFA() {
    const hasMFA = useManageMfa()

    if (hasMFA === null) return null

    return <ManageMFAView hasMFA={hasMFA} />
}
