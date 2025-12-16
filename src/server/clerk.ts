import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { capitalize } from 'remeda'
import { db } from '@/database'
import { getOrgInfoForUserId } from './db/queries'
import { PROD_ENV } from './config'
import { marshalSession, type syncUserMetadataFn } from './session'
import logger from '@/lib/logger'

export { type UserSessionWithAbility } from './session'

type ClerkOrganizationProps = {
    adminUserId?: string
    name?: string
    slug: string
}

export const findOrCreateClerkOrganization = async ({ name, slug, adminUserId }: ClerkOrganizationProps) => {
    const client = await clerkClient()

    try {
        const clerkOrg = await client.organizations.getOrganization({ slug: slug })
        return clerkOrg
    } catch {
        let userId: string | null | undefined = adminUserId
        if (!userId) {
            const cu = await auth()
            userId = cu.userId
            if (!userId) throw new Error('Not logged in')
        }

        const clerkOrg = await client.organizations.createOrganization({
            name: name || `${capitalize(slug)}`,
            createdBy: userId,
            slug,
        })

        return clerkOrg
    }
}

export async function calculateUserPublicMetadata(userId: string): Promise<UserInfo> {
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
    return metadata
}

export const updateClerkUserMetadata = async (userId: string) => {
    const { clerkId } = await db.selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()
    const client = await clerkClient()

    const metadata = await calculateUserPublicMetadata(userId)

    logger.info('Updating user metadata for clerkId:', clerkId, 'with metadata:', metadata)

    // Flattened structure - no environment key wrapping
    await client.users.updateUserMetadata(clerkId, {
        publicMetadata: metadata as UserPublicMetadata,
    })

    return metadata
}

export const syncCurrentClerkUser = async () => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')

    let user = await db.selectFrom('user').select('id').where('clerkId', '=', clerkUser.id).executeTakeFirst()

    // we do not sync on prod, syncing is only intended to keep dev/qa/staging updated
    if (PROD_ENV) {
        if (!user) throw new Error(`no user found for clerk user id ${clerkUser.id}`)
        return user
    }

    // temporary hack, we do not currently have UI
    // edit user information in the app, so we use clerk
    const userAttrs = {
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
    }

    if (user) {
        await db.updateTable('user').set(userAttrs).where('id', '=', user.id).executeTakeFirstOrThrow()
    } else {
        // the user came with a clerk account but does not have a user account here
        user = await db
            .insertInto('user')
            .values({
                clerkId: clerkUser.id,
                ...userAttrs,
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    // App DB is the source of truth for org memberships.
    // We no longer sync org memberships from Clerk metadata.

    return user
}

export async function sessionFromClerk() {
    const { userId, sessionClaims } = await auth()

    const syncer: syncUserMetadataFn = async () => {
        await syncCurrentClerkUser()
        const user = await db.selectFrom('user').select('id').where('clerkId', '=', userId!).executeTakeFirstOrThrow()
        return await updateClerkUserMetadata(user.id)
    }

    return await marshalSession(userId, sessionClaims, syncer)
}
