import { ENVIRONMENT_ID } from './config'
import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'

export { subject, type AppAbility } from '@/lib/permissions'
export type { UserSession, UserSessionWithAbility }

type syncUserMetadataFn = (userId: string) => Promise<UserInfo | null>

export async function marshalSession(
    clerkUserId: string | null,
    sessionClaims: JwtPayload | null,
    syncer?: syncUserMetadataFn,
) {
    if (!clerkUserId || !sessionClaims) return null

    let info: UserInfo | null = sessionClaims.userMetadata?.[ENVIRONMENT_ID] || null

    if (!info) {
        // dunno how they got here, metadata should have been updated on login
        logger.warn(
            `clerk user ${clerkUserId} does not have metadata for environment ${ENVIRONMENT_ID} syncing: ${syncer ? 'yes' : 'no'}`,
        )
        if (syncer) {
            info = await syncer(clerkUserId)
            if (info) {
                sessionClaims.userMetadata[ENVIRONMENT_ID] = info
            } else {
                logger.warn(`clerk user ${clerkUserId} metadata sync failed`)
                return null
            }
        } else {
            return null
        }
    }

    return sessionFromMetadata({
        env: ENVIRONMENT_ID,
        metadata: sessionClaims.userMetadata || {},
        prefs: sessionClaims.unsafeMetadata || {},
        clerkUserId,
    })
}
