import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/database'
import { syncUserToDatabaseWithConflictResolution } from './user-sync'
import { updateClerkUserMetadata } from './clerk'

export { subject, type AppAbility } from '@/lib/permissions'
export type { UserSession, UserSessionWithAbility }

export interface MarshalSessionOptions {
    forceUpdate?: boolean
}

async function syncAndUpdateUserMetadata(clerkUserId: string): Promise<UserInfo | null> {
    const client = await clerkClient()
    const clerkUser = await client.users.getUser(clerkUserId)

    const email = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase()
    if (!email) {
        logger.warn(`clerk user ${clerkUserId} has no email address`)
        return null
    }

    const userAttrs = {
        clerkId: clerkUser.id,
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
        metadataUserId: clerkUser.publicMetadata?.user?.id,
    }

    const { id: userId } = await syncUserToDatabaseWithConflictResolution(userAttrs, async (previousUserId) => {
        await updateClerkUserMetadata(previousUserId)
    })

    return await updateClerkUserMetadata(userId)
}

export async function marshalSession(
    clerkUserId: string | null,
    sessionClaims: JwtPayload | null,
    options: MarshalSessionOptions = {},
) {
    if (!clerkUserId || !sessionClaims) return null

    const { forceUpdate = false } = options

    let info: UserInfo | null = (sessionClaims.userMetadata as UserInfo) || null

    let userMissing = false
    if (info?.format === 'v3' && info.user?.id && !forceUpdate) {
        const existing = await db.selectFrom('user').select('id').where('id', '=', info.user.id).executeTakeFirst()
        userMissing = !existing
    }

    const needsUpdate = !info || info.format !== 'v3' || forceUpdate || userMissing

    if (needsUpdate) {
        logger.info(
            `clerk user ${clerkUserId} needs metadata update (missing: ${!info}, format: ${info?.format}, forceUpdate: ${forceUpdate}, userMissing: ${userMissing})`,
        )

        info = await syncAndUpdateUserMetadata(clerkUserId)
        if (info) {
            sessionClaims.userMetadata = info
        } else {
            logger.warn(`clerk user ${clerkUserId} metadata sync failed`)
            return null
        }
    }

    return sessionFromMetadata({
        metadata: sessionClaims.userMetadata || {},
        prefs: sessionClaims.unsafeMetadata || {},
        clerkUserId,
    })
}
