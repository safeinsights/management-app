import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

export { subject, type AppAbility } from '@/lib/permissions'
export type { UserSession, UserSessionWithAbility }

export type syncUserMetadataFn = (userId: string) => Promise<UserInfo | null>

export async function marshalSession(
    clerkUserId: string | null,
    sessionClaims: JwtPayload | null,
    syncer?: syncUserMetadataFn,
) {
    if (!clerkUserId || !sessionClaims) return null

    // Flattened structure - userMetadata is directly UserInfo
    let info: UserInfo | null = (sessionClaims.userMetadata as UserInfo) || null

    if (!info || !info.format) {
        logger.info(`clerk user ${clerkUserId} does not have valid metadata, syncing: ${syncer ? 'yes' : 'no'}`)
        if (syncer) {
            info = await syncer(clerkUserId)
            if (info) {
                sessionClaims.userMetadata = info
            } else {
                logger.warn(`clerk user ${clerkUserId} metadata sync failed`)
                return null
            }
        } else {
            return null
        }
    }

    return sessionFromMetadata({
        metadata: sessionClaims.userMetadata || {},
        prefs: sessionClaims.unsafeMetadata || {},
        clerkUserId,
    })
}
