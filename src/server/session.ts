import { auth as clerkAuth } from '@clerk/nextjs/server'

import { ENVIRONMENT_ID } from './config'
import { syncCurrentClerkUser, updateClerkUserMetadata } from './clerk'
import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

export { subject, type AppAbility } from '@/lib/permissions'
export type { UserSession, UserSessionWithAbility }

export async function loadSession(): Promise<UserSessionWithAbility | null> {
    const { userId, sessionClaims } = await clerkAuth()

    return await sessionFromClerk(userId, sessionClaims)
}

export async function sessionFromClerk(clerkUserId: string | null, sessionClaims: JwtPayload | null) {
    if (!clerkUserId || !sessionClaims) return null

    let info: UserInfo = sessionClaims.userMetadata?.[ENVIRONMENT_ID] || null

    if (!info) {
        // dunno how they got here, metadata should have been updated on login
        logger.warn(`clerk user ${clerkUserId} does not have metadata`)

        const user = await syncCurrentClerkUser()
        info = await updateClerkUserMetadata(user.id)
    }

    return sessionFromMetadata({
        env: ENVIRONMENT_ID,
        metadata: sessionClaims.userMetadata || {},
        prefs: sessionClaims.unsafeMetadata || {},
        clerkUserId,
    })
}
