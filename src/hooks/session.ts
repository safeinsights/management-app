'use client'

import { useCallback, useMemo } from 'react'

import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

import { useUser } from '@clerk/nextjs'
import { useQuery, useQueryClient } from '@/common'
import { currentUserInfoAction } from '@/server/actions/user.actions'
import { useSessionInfo } from '@/components/layout/session-info-context'

export const CURRENT_USER_INFO_KEY = ['currentUserInfo']

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

// Null means the server found no session for a user Clerk reports as signed in. Throwing gets the
// request retried and then reported, rather than leaving the user without orgs and no word why.
async function fetchSignedInUserInfo() {
    const info = await currentUserInfoAction()
    if (info === null) throw new Error('The server found no session for the signed-in user')
    return info
}

// Keyed by the Clerk user id, so a sign-in, sign-out or account switch can never show another
// user's orgs. The layout's list, or legacy metadata, seeds it, so a normal page load asks nothing.
function useOrgListInfo(user: ClerkUser): UserInfo | null {
    const serverInfo = usableServerInfo(useSessionInfo(), user)
    const clerkUserId = user?.id
    const { data } = useQuery({
        queryKey: [...CURRENT_USER_INFO_KEY, clerkUserId],
        queryFn: fetchSignedInUserInfo,
        enabled: Boolean(clerkUserId),
        initialData: clerkUserId ? (serverInfo ?? legacyMetadataInfo(user) ?? undefined) : undefined,
        // The list changes only when a membership does, and those flows call useReloadOrgList.
        staleTime: Infinity,
        meta: { errorMessage: 'Failed to load your organizations' },
    })

    // Before Clerk loads, only the layout's list exists, and it is what the server rendered with.
    if (user === undefined) return serverInfo
    return clerkUserId ? (data ?? null) : null
}

// Await it before navigating, so the destination renders with the new membership.
export const useReloadOrgList = (): (() => Promise<void>) => {
    const queryClient = useQueryClient()
    return useCallback(() => queryClient.invalidateQueries({ queryKey: CURRENT_USER_INFO_KEY }), [queryClient])
}

export const useSession = ():
    | { isLoaded: false; session: null }
    | { isLoaded: true; session: UserSessionWithAbility } => {
    const { user } = useUser()
    const info = useOrgListInfo(user)

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
