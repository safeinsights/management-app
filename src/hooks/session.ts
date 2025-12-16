'use client'

import { useState, useEffect } from 'react'

import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

import { useUser } from '@clerk/nextjs'
import { syncUserMetadataAction } from '@/server/actions/user.actions'

export const useSession = ():
    | { isLoaded: false; session: null }
    | { isLoaded: true; session: UserSessionWithAbility } => {
    const { user } = useUser()

    const [session, setSession] = useState<UserSessionWithAbility | null>(null)

    useEffect(() => {
        if (!user) return

        try {
            // Flattened structure - publicMetadata is directly UserInfo
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
                    // Flattened structure - metadata is directly UserInfo
                    const updatedSession = sessionFromMetadata({
                        metadata: metadata as UserPublicMetadata,
                        prefs: (user.unsafeMetadata || {}) as UserUnsafeMetadata,
                        clerkUserId: user.id,
                    })

                    setSession(updatedSession)
                })
                .catch(() => {
                    // Silently fail - session will remain null and component can handle loading state
                })
        }
    }, [user?.id, user?.publicMetadata, user])

    if (session) {
        return { isLoaded: true, session }
    }

    return {
        isLoaded: false,
        session,
    }
}
