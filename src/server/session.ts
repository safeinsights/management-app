import { auth as clerkAuth } from '@clerk/nextjs/server'

import { ENVIRONMENT_ID } from './config'
import { syncCurrentClerkUser, updateClerkUserMetadata } from './clerk'
import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata } from '@/lib/session'

export type { UserSession }

export async function loadSession(): Promise<UserSession | null> {
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

    // const prefs = sessionClaims.unsafeMetadata?.[ENVIRONMENT_ID] || null

    // const teamSlug = prefs?.currentTeamSlug || Object.values(info.teams)[0]?.slug
    // if (!teamSlug) throw new Error(`user ${clerkUserId} does not belong to any teams`)

    // const team = info.teams[teamSlug]
    // if (!team) throw new Error(`user ${clerkUserId} does not belong to any teams`)

    // return {
    //     user: {
    //         ...info.user,
    //         clerkUserId,
    //         isSiAdmin: Boolean(info.teams[CLERK_ADMIN_ORG_SLUG]?.isAdmin),
    //     },
    //     team,
    // }
}
