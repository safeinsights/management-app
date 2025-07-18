'use client'

import { useEnvironmentId } from '@/hooks/environment'
import { sessionFromMetadata } from '@/lib/session'
import { UserSession } from '@/lib/types'
import { useUser } from '@clerk/nextjs'

export const useSession = (): { isLoaded: false; session: null } | { isLoaded: true; session: UserSession } => {
    const env = useEnvironmentId()

    const { user, isLoaded } = useUser()

    if (!env || !isLoaded || !user) return { isLoaded: false, session: null }

    const session = sessionFromMetadata({
        env,
        metadata: user.publicMetadata || {},
        prefs: user.unsafeMetadata || {},
        clerkUserId: user.id,
    })

    return {
        isLoaded: true,
        session,
    }
}
