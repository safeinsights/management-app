'use client'

import { useState, useEffect, useMemo } from 'react'

import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

import { useUser } from '@clerk/nextjs'
import { reportError } from '@/components/errors'
import { actionResult } from '@/lib/utils'
import { currentUserInfoAction } from '@/server/actions/user.actions'
import { useSessionInfo } from '@/components/layout/session-info-context'

type ClerkUser = ReturnType<typeof useUser>['user']

// The root layout's org list matches what the server enforces, but it was rendered for whoever
// made the request. Clerk can since have signed that user out, or into another account.
function usableServerInfo(serverInfo: UserInfo | null, user: ClerkUser): UserInfo | null {
    if (!serverInfo || user === null) return null
    if (user && user.publicMetadata?.user?.id !== serverInfo.user.id) return null
    return serverInfo
}

// Only users that the OTTER-752 script has not slimmed yet still carry orgs in publicMetadata.
function legacyMetadataInfo(user: ClerkUser): UserInfo | null {
    const metadata = user?.publicMetadata
    return metadata?.format === 'v3' && metadata.orgs ? (metadata as UserInfo) : null
}

// Without the layout's list, publicMetadata has no orgs to fall back on, so ask the server.
function useFallbackUserInfo(user: ClerkUser, isNeeded: boolean): UserInfo | null {
    const [fetched, setFetched] = useState<{ clerkUserId: string; info: UserInfo } | null>(null)
    const legacyInfo = legacyMetadataInfo(user)
    const clerkUserId = user?.id
    const shouldFetch = isNeeded && Boolean(clerkUserId) && !legacyInfo

    useEffect(() => {
        if (!shouldFetch || !clerkUserId) return
        let isCurrent = true
        currentUserInfoAction()
            .then((response) => {
                const info = actionResult(response)
                if (isCurrent && info) setFetched({ clerkUserId, info })
            })
            .catch((error: unknown) => reportError(error, 'Failed to load your organizations'))
        return () => {
            isCurrent = false
        }
    }, [shouldFetch, clerkUserId])

    if (!isNeeded || !user) return null
    if (legacyInfo) return legacyInfo
    return fetched?.clerkUserId === user.id ? fetched.info : null
}

export const useSession = ():
    | { isLoaded: false; session: null }
    | { isLoaded: true; session: UserSessionWithAbility } => {
    const { user } = useUser()
    const serverInfo = usableServerInfo(useSessionInfo(), user)
    const fallbackInfo = useFallbackUserInfo(user, !serverInfo)
    const info = serverInfo ?? fallbackInfo

    const session = useMemo(
        () =>
            info
                ? sessionFromMetadata({
                      metadata: info as UserPublicMetadata,
                      prefs: (user?.unsafeMetadata || {}) as UserUnsafeMetadata,
                      clerkUserId: user?.id ?? '',
                  })
                : null,
        [info, user?.id, user?.unsafeMetadata],
    )

    return session ? { isLoaded: true, session } : { isLoaded: false, session: null }
}
