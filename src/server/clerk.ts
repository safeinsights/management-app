import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { capitalize, omit } from 'remeda'
import { db } from '@/database'
import { getOrgInfoForUserId } from './db/queries'
import { ENVIRONMENT_ID } from './config'
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
    const teams = await getOrgInfoForUserId(userId)
    const metadata: UserInfo = {
        user: { id: userId },
        teams: teams.reduce(
            (acc, team) => {
                acc[team.slug] = {
                    id: team.id,
                    slug: team.slug,
                    isAdmin: team.isAdmin || false,
                    isReviewer: team.isReviewer || false,
                    isResearcher: team.isResearcher || false,
                }
                return acc
            },
            {} as UserInfo['teams'],
        ),
    }
    return metadata
}

export const updateClerkUserMetadata = async (userId: string) => {
    const { clerkId } = await db.selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()
    const client = await clerkClient()
    const user = await client.users.getUser(clerkId)

    const metadata = await calculateUserPublicMetadata(userId)

    logger.info('Updating user metadata for clerkId:', clerkId, 'with metadata:', metadata)

    await client.users.updateUserMetadata(clerkId, {
        publicMetadata: {
            // remove legacy items
            // TODO: remove the `omit` after 2025-08-15, evverything should be migrated by then
            ...omit(user.publicMetadata, ['orgs', 'memberships', 'userId']),
            [`${ENVIRONMENT_ID}`]: metadata,
        },
    })

    return metadata
}

export const syncCurrentClerkUser = async () => {
    const clerkUser = await currentUser()

    if (!clerkUser) throw new Error('User not authenticated')

    // temporary hack, we do not currently have UI
    // edit user information in the app, so we use clerk
    const userAttrs = {
        firstName: clerkUser.firstName ?? '',
        lastName: clerkUser.lastName ?? '',
        email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
    }

    let user = await db.selectFrom('user').select('id').where('clerkId', '=', clerkUser.id).executeTakeFirst()
    if (user) {
        await db.updateTable('user').set(userAttrs).where('id', '=', user.id).executeTakeFirstOrThrow()
    } else {
        user = await db
            .insertInto('user')
            .values({
                clerkId: clerkUser.id,
                ...userAttrs,
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user
}

export async function sessionFromClerk() {
    const { userId, sessionClaims } = await auth()

    const syncer: syncUserMetadataFn = async () => {
        const user = await syncCurrentClerkUser()
        return await updateClerkUserMetadata(user.id)
    }

    return await marshalSession(userId, sessionClaims, syncer)
}
