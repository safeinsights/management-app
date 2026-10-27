'use client'

import { useEffect, useEffectEvent } from 'react'
import { ManageMFAView } from './manage-mfa-view'
import { useRequireUser } from './use-require-user'

function useManageMfa() {
    const { user } = useRequireUser()
    const userId = user?.id

    // Picks up a factor enrolled on another page; Clerk's cached user would still say "no MFA".
    const reloadUser = useEffectEvent(() => void user?.reload())
    useEffect(() => {
        if (userId) reloadUser()
    }, [userId])

    if (!user) return null
    return user.twoFactorEnabled && !window.location.search.includes('TESTING_FORCE_NO_MFA')
}

export function ManageMFA() {
    const hasMFA = useManageMfa()

    if (hasMFA === null) return null

    return <ManageMFAView hasMFA={hasMFA} />
}
