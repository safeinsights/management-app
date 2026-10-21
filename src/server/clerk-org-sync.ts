import { auth, clerkClient } from '@clerk/nextjs/server'
// The hook runs after the transaction closed, so it needs the root handle, not currentDb().
// eslint-disable-next-line no-restricted-imports
import { db } from '@/database'
import { createClerkOrgSync, type SyncOrg } from '@/lib/clerk-org-sync-core'
import logger from '@/lib/logger'
import { clerkOrgSyncEnabled } from '@/server/config'
import { currentDb, localStorageContext } from '@/server/request-context'

type ClerkOrgSync = ReturnType<typeof createClerkOrgSync>

// Clerk is a read copy of the DB: it hears of a change only once the change commits, and a Clerk
// failure is logged for the backfill to repair rather than failing the request.
async function afterCommitToClerk(operation: string, orgSlug: string, call: (sync: ClerkOrgSync) => Promise<unknown>) {
    const run = async () => {
        try {
            await call(createClerkOrgSync((await clerkClient()).organizations))
        } catch (error) {
            // Stable message: alerts match on it.
            logger.error('clerk-org-sync failed', { operation, orgSlug, error })
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
    await afterCommitToClerk('syncOrg', slug, (sync) =>
        sync.syncOrg({ slug, name, type }, { createdBy: userId, keepCreator: opts.keepCreator }),
    )
}

export async function deleteOrgFromClerk(slug: string) {
    if (!clerkOrgSyncEnabled()) return
    await afterCommitToClerk('deleteOrg', slug, (sync) => sync.deleteOrg(slug))
}

// Reads the membership when the hook runs, not when it is queued, so quick successive changes
// converge on the committed state whatever order the hooks run in.
async function reconcileMembership({ userId, orgId }: { userId: string; orgId: string }) {
    if (!clerkOrgSyncEnabled()) return
    const [org, clerkId] = await Promise.all([orgById(orgId), clerkIdOf(userId)])
    await afterCommitToClerk('reconcileMembership', org.slug, async (sync) => {
        const row = await db
            .selectFrom('orgUser')
            .select('isAdmin')
            .where('orgId', '=', orgId)
            .where('userId', '=', userId)
            .executeTakeFirst()
        if (row) await sync.syncMembership(org, clerkId, row.isAdmin)
        else await sync.removeMembership(org.slug, clerkId)
    })
}

export const syncMembershipToClerk = reconcileMembership
export const removeMembershipFromClerk = reconcileMembership
