import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { capitalize } from 'remeda'
import { db } from '@/database'
import { getOrgInfoForUserId } from './db/queries'
import { marshalSession, type MarshalSessionOptions } from './session'
import logger from '@/lib/logger'
import { syncUserToDatabaseWithConflictResolution } from './user-sync'

export { type UserSessionWithAbility } from './session'

// Re-export test user utilities for convenience
export { TEST_USER_PATTERN, getProtectedTestEmails, isTestUser } from '@/lib/clerk'

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

    await client.users.updateUserMetadata(clerkId, {
        publicMetadata: metadata as unknown as UserPublicMetadata,
    })

    return metadata
}

export const updateClerkUserName = async (userId: string, firstName: string, lastName: string) => {
    const { clerkId } = await db.selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()
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
    }

    return await syncUserToDatabaseWithConflictResolution(userAttrs)
}

export async function sessionFromClerk(options?: MarshalSessionOptions) {
    const { userId, sessionClaims } = await auth()
    return await marshalSession(userId, sessionClaims, options)
}
