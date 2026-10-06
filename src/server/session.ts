import { UserSession } from '@/lib/types'
import logger from '@/lib/logger'
import { JwtPayload } from 'jsonwebtoken'
import { sessionFromMetadata, type UserSessionWithAbility } from '@/lib/session'
import { clerkClient } from '@clerk/nextjs/server'
import { syncUserToDatabaseWithConflictResolution } from './user-sync'
import { headers } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { sessionFromClerk, updateClerkUserMetadata } from './clerk'
import { sessionUserOrgs } from './db/session-user'

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

    // Partial: older tokens can lack the format or the user.
    const token = (sessionClaims.userMetadata as Partial<UserPublicMetadata> | undefined) ?? null
    const userId = token?.format === 'v3' && !forceUpdate ? token.user?.id : undefined
    // Orgs come from the database even when a token from before the OTTER-752 script still carries
    // them, so a membership change takes effect at the next request for every user.
    const orgs = userId ? await sessionUserOrgs(userId, clerkUserId) : null

    let info: UserInfo | null = userId && orgs ? { format: 'v3', user: { id: userId }, teams: null, orgs } : null
    if (!info) {
        logger.info(
            `clerk user ${clerkUserId} needs metadata update (missing: ${!token}, format: ${token?.format}, user id: ${token?.user?.id}, forceUpdate: ${forceUpdate})`,
        )
        info = await syncAndUpdateUserMetadata(clerkUserId)
        if (!info) {
            logger.warn(`clerk user ${clerkUserId} metadata sync failed`)
            return null
        }
    }
    sessionClaims.userMetadata = info

    return sessionFromMetadata({
        metadata: sessionClaims.userMetadata,
        prefs: sessionClaims.unsafeMetadata || {},
        clerkUserId,
    })
}

// Plain data only: the client rebuilds `can` from it with sessionFromMetadata.
export function clientUserInfo(session: UserSession | null): UserInfo | null {
    if (!session) return null
    return { format: 'v3', user: { id: session.user.id }, teams: null, orgs: session.orgs }
}

// The header that Clerk's auth() checks for its middleware. The proxy skips /api and asset paths,
// yet a 404 there still renders the root layout, where auth() would throw.
const CLERK_AUTH_STATUS_HEADER = 'x-clerk-auth-status'

// The root layout renders every page, sign-in included, so a throw here would leave the user on
// the global error page with no sign-out. With null, the client fetches the list itself and reports
// a failure there.
export async function clientUserInfoForRequest(): Promise<UserInfo | null> {
    if (!(await headers()).get(CLERK_AUTH_STATUS_HEADER)) return null
    try {
        return clientUserInfo(await sessionFromClerk())
    } catch (error) {
        unstable_rethrow(error)
        // logger.error also sends the error to Sentry.
        logger.error('Failed to load the session for the root layout:', error)
        return null
    }
}
