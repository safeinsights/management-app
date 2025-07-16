import { auth as clerkAuth } from '@clerk/nextjs/server'

import { ENVIRONMENT_ID } from './config'
import { syncCurrentClerkUser, updateClerkUserMetadata } from './clerk'
import * as Sentry from '@sentry/nextjs'
import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'

export async function loadSession(): Promise<UserSession | null> {

    const { userId: clerkUserId, sessionClaims } = await clerkAuth()

    if (!clerkUserId || !sessionClaims) return null

    let info: UserInfo = sessionClaims.userMetadata?.[ENVIRONMENT_ID] || null

    if (!info) {
        // dunno how they got here, metadata should have been updated on login
        logger.warn(`clerk user ${clerkUserId} does not have metadata`)

        const user = await syncCurrentClerkUser()
        info = await updateClerkUserMetadata(user.id)
    }

    const prefs = sessionClaims.unsafeMetadata?.[ENVIRONMENT_ID] || null

    const teamSlug = prefs?.currentTeamSlug || Object.values(info.teams)[0]?.slug
    if (!teamSlug) throw new Error(`user ${clerkUserId} does not belong to any teams`)

    const team = info.teams[teamSlug]
    if (!team) throw new Error(`user ${clerkUserId} does not belong to any teams`)


    Sentry.setUser({ id: info.user.id })
    Sentry.setTag('team', team.slug)

    return {
        ...info,
        team,
    }
}
