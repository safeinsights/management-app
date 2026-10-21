import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClerkOrgSync, type SyncOrg } from '@/lib/clerk-org-sync-core'
import { currentDb } from '@/server/request-context'

const clerkSync = async () => createClerkOrgSync((await clerkClient()).organizations)

const orgById = (orgId: string) =>
    currentDb().selectFrom('org').select(['slug', 'name', 'type']).where('id', '=', orgId).executeTakeFirstOrThrow()

const clerkIdOf = async (userId: string) =>
    (await currentDb().selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()).clerkId

export async function syncOrgToClerk(org: SyncOrg, opts: { keepCreator?: boolean } = {}) {
    const { userId } = await auth()
    if (!userId) throw new Error('Not logged in')
    await (await clerkSync()).syncOrg(org, { createdBy: userId, keepCreator: opts.keepCreator })
}

export async function deleteOrgFromClerk(slug: string) {
    await (await clerkSync()).deleteOrg(slug)
}

export async function syncMembershipToClerk({
    userId,
    orgId,
    isAdmin,
}: {
    userId: string
    orgId: string
    isAdmin: boolean
}) {
    const [org, clerkId] = await Promise.all([orgById(orgId), clerkIdOf(userId)])
    await (await clerkSync()).syncMembership(org, clerkId, isAdmin)
}

export async function removeMembershipFromClerk({ userId, orgId }: { userId: string; orgId: string }) {
    const [org, clerkId] = await Promise.all([orgById(orgId), clerkIdOf(userId)])
    await (await clerkSync()).removeMembership(org.slug, clerkId)
}
