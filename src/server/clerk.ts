import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { cache } from 'react'
import { getOrgInfoForUserId } from './db/queries'
import { marshalSession, type MarshalSessionOptions } from './session'
import logger from '@/lib/logger'
import { syncUserToDatabaseWithConflictResolution } from './user-sync'
import { fullUserInfo, publicMetadata } from '@/lib/clerk'
import { orgsBySlug } from './db/session-user'
import { currentDb } from '@/server/request-context'

export { type UserSessionWithAbility } from './session'

export { TEST_USER_PATTERN, getProtectedTestEmails, isTestUser } from '@/lib/clerk'

export async function calculateUserPublicMetadata(userId: string): Promise<UserInfo & UserPublicMetadata> {
    const orgs = await getOrgInfoForUserId(userId)
    return fullUserInfo(userId, orgsBySlug(orgs))
}

// Returns the full info with orgs: callers build the session from it.
export const updateClerkUserMetadata = async (userId: string) => {
    const { clerkId } = await currentDb()
        .selectFrom('user')
        .select('clerkId')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()
    const client = await clerkClient()

    const metadata = await calculateUserPublicMetadata(userId)

    logger.info(`Updating user metadata for clerkId: ${clerkId}, user id: ${userId}`)

    // updateUser replaces publicMetadata wholesale; updateUserMetadata deep-merges, which would keep
    // an old `orgs` key.
    // When upgrading to Clerk BAPI 2026-05-12, use replaceUserMetadata (not the merge API).
    await client.users.updateUser(clerkId, { publicMetadata: publicMetadata(metadata) })

    return metadata
}

export const updateClerkUserName = async (userId: string, firstName: string, lastName: string) => {
    const { clerkId } = await currentDb()
        .selectFrom('user')
        .select('clerkId')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow()
    const client = await clerkClient()
    await client.users.updateUser(clerkId, { firstName, lastName })
}

export const syncCurrentClerkUser = async () => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')

    const email = clerkUser.primaryEmailAddress?.emailAddress?.toLowerCase()
    if (!email) throw new Error('User has no email address')

    const userAttrs = {
        clerkId: clerkUser.id,
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
        metadataUserId: clerkUser.publicMetadata?.user?.id,
    }

    return await syncUserToDatabaseWithConflictResolution(userAttrs)
}

// cache() dedupes the marshal across one RSC render. A forceUpdate caller passes a fresh options
// object, whose identity never hits the zero-arg cache entry, so a forced re-sync always executes.
export const sessionFromClerk = cache(async (options?: MarshalSessionOptions) => {
    const { userId, sessionClaims } = await auth()
    return await marshalSession(userId, sessionClaims, options)
})
