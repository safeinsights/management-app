import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'
import { clerkClient } from '@clerk/nextjs/server'
import { getOrgInfoForUserId } from './db/queries'
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
    }

    const { id: userId } = await syncUserToDatabaseWithConflictResolution(userAttrs, async (previousUserId) => {
        await updateClerkUserMetadata(previousUserId)
    })

    const orgs = await getOrgInfoForUserId(userId)
    const metadata: UserInfo = {
        format: 'v3',
        user: { id: userId },
        teams: null,
        orgs: orgs.reduce(
            (acc, org) => {
                acc[org.slug] = {
                    ...org,
                    isAdmin: org.isAdmin || false,
                }
                return acc
            },
            {} as UserInfo['orgs'],
        ),
    }

    logger.info('Updating user metadata for clerkId:', clerkUserId, 'with metadata:', metadata)

    await client.users.updateUserMetadata(clerkUserId, {
        publicMetadata: metadata as unknown as UserPublicMetadata,
    })

    return metadata
}

export async function marshalSession(
    clerkUserId: string | null,
    sessionClaims: JwtPayload | null,
    options: MarshalSessionOptions = {},
) {
    if (!clerkUserId || !sessionClaims) return null

    const { forceUpdate = false } = options

    let info: UserInfo | null = (sessionClaims.userMetadata as UserInfo) || null

    const needsUpdate = !info || info.format !== 'v3' || forceUpdate

    if (needsUpdate) {
        logger.info(
            `clerk user ${clerkUserId} needs metadata update (missing: ${!info}, format: ${info?.format}, forceUpdate: ${forceUpdate})`,
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
