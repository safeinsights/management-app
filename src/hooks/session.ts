'use client'

import { useState, useEffect } from 'react'

import { useEnvironmentId } from '@/hooks/environment'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

import { useUser } from '@clerk/nextjs'
import { syncUserMetadataAction } from '@/server/actions/user.actions'

export const useSession = ():
    | { isLoaded: false; session: null }
    | { isLoaded: true; session: UserSessionWithAbility } => {
    const env = useEnvironmentId()

    const { user } = useUser()

    const [session, setSession] = useState<UserSessionWithAbility | null>(null)

    useEffect(() => {
        if (!user) return

        try {
            const sessFromMD = sessionFromMetadata({
                env,
                metadata: user.publicMetadata || {},
                prefs: user.unsafeMetadata || {},
                clerkUserId: user.id,
            })
            setSession(sessFromMD) // eslint-disable-line react-hooks/set-state-in-effect -- session sync on user change is intentional
        } catch {
            syncUserMetadataAction().then((metadata) => {
                const updatedSession = sessionFromMetadata({
                    env,
                    metadata: { [`${env}`]: metadata },
                    prefs: user.unsafeMetadata || {},
                    clerkUserId: user.id,
                })

                setSession(updatedSession)
            })
        }
    }, [user?.id, user?.publicMetadata, env, user])

    if (session) {
        return { isLoaded: true, session }
    }

    return {
        isLoaded: false,
        session,
    }
}
