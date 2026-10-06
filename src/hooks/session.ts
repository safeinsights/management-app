'use client'

import { useState, useEffect, useMemo } from 'react'

import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

import { useUser } from '@clerk/nextjs'
import { syncUserMetadataAction } from '@/server/actions/user.actions'
import { useSessionInfo } from '@/components/layout/session-info-context'

export const useSession = ():
    | { isLoaded: false; session: null }
    | { isLoaded: true; session: UserSessionWithAbility } => {
    const { user } = useUser()
    // The root layout's org list matches what the server enforces; Clerk's publicMetadata can lag behind it.
    const serverInfo = useSessionInfo()

    const fromServer = useMemo(
        () =>
            serverInfo
                ? sessionFromMetadata({
                      metadata: serverInfo as unknown as UserPublicMetadata,
                      prefs: (user?.unsafeMetadata || {}) as UserUnsafeMetadata,
                      clerkUserId: user?.id ?? '',
                  })
                : null,
        [serverInfo, user?.id, user?.unsafeMetadata],
    )

    const [session, setSession] = useState<UserSessionWithAbility | null>(null)

    useEffect(() => {
        if (!user || serverInfo) return

        try {
            const sessFromMD = sessionFromMetadata({
                metadata: (user.publicMetadata || {}) as UserPublicMetadata,
                prefs: (user.unsafeMetadata || {}) as UserUnsafeMetadata,
                clerkUserId: user.id,
            })
            // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing external auth state
            setSession(sessFromMD)
        } catch {
            syncUserMetadataAction()
                .then((metadata) => {
                    if (!metadata) return
                    const updatedSession = sessionFromMetadata({
                        metadata: metadata as UserPublicMetadata,
                        prefs: (user.unsafeMetadata || {}) as UserUnsafeMetadata,
                        clerkUserId: user.id,
                    })

                    setSession(updatedSession)
                })
                .catch(() => {})
        }
    }, [user?.id, user?.publicMetadata, user, serverInfo])

    if (fromServer) {
        return { isLoaded: true, session: fromServer }
    }

    if (session) {
        return { isLoaded: true, session }
    }

    return {
        isLoaded: false,
        session,
    }
}
