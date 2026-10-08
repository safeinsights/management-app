import { fullUserInfo } from '@/lib/clerk'
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

async function syncAndUpdateUserMetadata(clerkUserId: string): Promise<(UserInfo & UserPublicMetadata) | null> {
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

    let info: (UserInfo & UserPublicMetadata) | null = userId && orgs ? fullUserInfo(userId, orgs) : null
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

    return sessionFromMetadata({
        metadata: info,
        prefs: sessionClaims.unsafeMetadata || {},
        clerkUserId,
    })
}

// Plain data only: the client rebuilds `can` from it with sessionFromMetadata.
export function clientUserInfo(session: UserSession | null): UserInfo | null {
    if (!session) return null
    return fullUserInfo(session.user.id, session.orgs)
}

// The header that Clerk's auth() checks for its middleware. The proxy skips /api and asset paths,
// yet a 404 there still renders the root layout, where auth() would throw.
const CLERK_AUTH_STATUS_HEADER = 'x-clerk-auth-status'

// The root layout renders every page, sign-in included, so a throw here would leave the user on
// the global error page with no sign-out. With null, the client fetches the list itself and reports
// a failure there.
export async function clientUserInfoForRequest(): Promise<UserInfo | null> {
    const requestHeaders = await headers()
    if (!requestHeaders.get(CLERK_AUTH_STATUS_HEADER)) {
        if (/(?:^|;\s*)__session=/.test(requestHeaders.get('cookie') ?? '')) {
            logger.warn('Clerk session cookie present without the middleware auth status header')
        }
        return null
    }
    try {
        return clientUserInfo(await sessionFromClerk())
    } catch (error) {
        unstable_rethrow(error)
        // logger.error also sends the error to Sentry.
        logger.error('Failed to load the session for the root layout:', error)
        return null
    }
}

export async function clientUserInfoSnapshotForRequest() {
    const userInfo = await clientUserInfoForRequest()
    return { userInfo, updatedAt: Date.now() }
}
