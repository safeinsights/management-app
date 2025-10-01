import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { capitalize, isObjectType } from 'remeda'
import { db } from '@/database'
import { getOrgInfoForUserId } from './db/queries'
import { ENVIRONMENT_ID, PROD_ENV } from './config'
import { marshalSession, type syncUserMetadataFn } from './session'
import logger from '@/lib/logger'
import { findOrCreateOrgMembership } from './mutations'
import { NotFoundError } from '@/lib/errors'

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
        format: 'v2',
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
    const user = await client.users.getUser(clerkId)

    const metadata = await calculateUserPublicMetadata(userId)

    logger.info('Updating user metadata for clerkId:', clerkId, 'with metadata:', metadata)

    await client.users.updateUserMetadata(clerkId, {
        publicMetadata: {
            ...user.publicMetadata,
            [`${ENVIRONMENT_ID}`]: metadata,
        },
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

    // loop through each env and attempt to establish the same roles in this one
    for (const env of Object.values(clerkUser.publicMetadata || {})) {
        if (isObjectType(env)) {
            const envData = env as Record<string, unknown>
            // TODO: remove v1Metadata migration and 'teams' access after 2026-02-15
            const orgs = envData['orgs'] || (envData['teams'] as Record<string, unknown>)

            if (isObjectType(orgs)) {
                // Check if this is v1 metadata (no format field or not v2)
                // TODO: remove v1Metadata migration after 2026-02-15
                const isV1Metadata = !envData.format || envData.format !== 'v2'

                for (const slug of Object.keys(orgs)) {
                    try {
                        if (isV1Metadata) {
                            const info = (orgs as Record<string, unknown>)[slug] as UserOrgMembershipInfoV1
                            if (info.isReviewer) {
                                await findOrCreateOrgMembership({ userId: user.id, ...info })
                            } else if (info.isResearcher) {
                                await findOrCreateOrgMembership({
                                    userId: user.id,
                                    slug: `${slug}-lab`,
                                    isAdmin: false,
                                })
                                // no other roles, need to remove the org from metadata
                                if (!info.isReviewer && !info.isAdmin) {
                                    const client = await clerkClient()
                                    await client.users.updateUserMetadata(clerkUser.id, {
                                        publicMetadata: {
                                            [`${ENVIRONMENT_ID}`]: { orgs: { [`${slug}`]: null } },
                                        },
                                    })
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    delete ((envData.orgs || {}) as Record<string, any>)[slug]
                                }
                            }
                        } else {
                            const info = (orgs as Record<string, unknown>)[slug] as UserOrgMembershipInfo
                            await findOrCreateOrgMembership({ userId: user.id, ...info })
                        }
                    } catch (e) {
                        // not found is thrown when the org doesn't exist
                        if (!(e instanceof NotFoundError)) {
                            throw e
                        }
                    }
                }
            }
        }
    }

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
