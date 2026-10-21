import { auth, clerkClient } from '@clerk/nextjs/server'
import { createClerkOrgSync, type SyncOrg } from '@/lib/clerk-org-sync-core'
import logger from '@/lib/logger'
import { clerkOrgSyncEnabled } from '@/server/config'
import { currentDb, localStorageContext } from '@/server/request-context'

type ClerkOrgSync = ReturnType<typeof createClerkOrgSync>

// Clerk is a read copy of the DB: it hears of a change only once the change commits, and a Clerk
// failure is logged for the backfill to repair rather than failing the request.
async function afterCommitToClerk(call: (sync: ClerkOrgSync) => Promise<unknown>) {
    const run = async () => {
        try {
            await call(createClerkOrgSync((await clerkClient()).organizations))
        } catch (error) {
            logger.error(error)
        }
    }
    const afterCommit = localStorageContext.getStore()?.afterCommit
    if (afterCommit) afterCommit(run)
    else await run()
}

const orgById = (orgId: string) =>
    currentDb().selectFrom('org').select(['slug', 'name', 'type']).where('id', '=', orgId).executeTakeFirstOrThrow()

const clerkIdOf = async (userId: string) =>
    (await currentDb().selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow()).clerkId

export async function syncOrgToClerk(org: SyncOrg, opts: { keepCreator?: boolean } = {}) {
    if (!clerkOrgSyncEnabled()) return
    const { userId } = await auth()
    if (!userId) {
        logger.error(new Error(`cannot sync org ${org.slug} to Clerk: not logged in`))
        return
    }
    const { slug, name, type } = org
    await afterCommitToClerk((sync) =>
        sync.syncOrg({ slug, name, type }, { createdBy: userId, keepCreator: opts.keepCreator }),
    )
}

export async function deleteOrgFromClerk(slug: string) {
    if (!clerkOrgSyncEnabled()) return
    await afterCommitToClerk((sync) => sync.deleteOrg(slug))
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
    if (!clerkOrgSyncEnabled()) return
    const [org, clerkId] = await Promise.all([orgById(orgId), clerkIdOf(userId)])
    await afterCommitToClerk((sync) => sync.syncMembership(org, clerkId, isAdmin))
}

export async function removeMembershipFromClerk({ userId, orgId }: { userId: string; orgId: string }) {
    if (!clerkOrgSyncEnabled()) return
    const [org, clerkId] = await Promise.all([orgById(orgId), clerkIdOf(userId)])
    await afterCommitToClerk((sync) => sync.removeMembership(org.slug, clerkId))
}
