import { isDeepStrictEqual } from 'node:util'
import { clerkClient } from '@clerk/nextjs/server'
// The hook runs after the transaction closed, so it needs the root handle, not currentDb().
// eslint-disable-next-line no-restricted-imports
import { db } from '@/database'
import { createClerkOrgSync } from '@/lib/clerk-org-sync-core'
import logger from '@/lib/logger'
import { clerkOrgSyncEnabled } from '@/server/config'
import { currentDb, localStorageContext } from '@/server/request-context'

type ClerkOrgSync = ReturnType<typeof createClerkOrgSync>

const MAX_SYNC_PASSES = 3

// Clerk is a read copy of the DB: it hears of a change only once the change commits, and a Clerk
// failure is logged for the backfill to repair rather than failing the request.
// A newer change can commit and sync while this hook waits on Clerk, so the hook re-reads the DB
// after each write and writes again until it stops changing. The last writer then wrote the committed state.
async function afterCommitToClerk<T>(
    operation: string,
    orgSlug: string,
    read: () => Promise<T>,
    write: (sync: ClerkOrgSync, state: T) => Promise<unknown>,
) {
    const run = async () => {
        try {
            const sync = createClerkOrgSync((await clerkClient()).organizations)
            let state = await read()
            for (let pass = 1; ; pass++) {
                await write(sync, state)
                const latest = await read()
                if (isDeepStrictEqual(latest, state)) return
                if (pass === MAX_SYNC_PASSES) throw new Error(`database still changing after ${pass} passes`)
                state = latest
            }
        } catch (error) {
            // Stable message: alerts match on it.
            logger.error('clerk-org-sync failed', { operation, orgSlug, error })
        }
    }
    const afterCommit = localStorageContext.getStore()?.afterCommit
    if (afterCommit) afterCommit(run)
    else await run()
}

// Slugs cannot change, so the slug names the same org when the hook runs as when it was queued.
async function reconcileOrg(slug: string) {
    if (!clerkOrgSyncEnabled()) return
    await afterCommitToClerk(
        'reconcileOrg',
        slug,
        () => db.selectFrom('org').select(['slug', 'name', 'type']).where('slug', '=', slug).executeTakeFirst(),
        (sync, org) => (org ? sync.syncOrg(org) : sync.deleteOrg(slug)),
    )
}

export const syncOrgToClerk = reconcileOrg
export const deleteOrgFromClerk = reconcileOrg

const readMembership = (orgId: string, userId: string) =>
    db
        .selectFrom('org')
        .leftJoin('orgUser', (join) => join.onRef('orgUser.orgId', '=', 'org.id').on('orgUser.userId', '=', userId))
        .select(['org.slug', 'org.name', 'org.type', 'orgUser.isAdmin'])
        .where('org.id', '=', orgId)
        .executeTakeFirst()

async function reconcileMembership({ userId, orgId }: { userId: string; orgId: string }) {
    if (!clerkOrgSyncEnabled()) return
    const [{ slug }, { clerkId }] = await Promise.all([
        currentDb().selectFrom('org').select('slug').where('id', '=', orgId).executeTakeFirstOrThrow(),
        currentDb().selectFrom('user').select('clerkId').where('id', '=', userId).executeTakeFirstOrThrow(),
    ])
    await afterCommitToClerk(
        'reconcileMembership',
        slug,
        () => readMembership(orgId, userId),
        (sync, row) => {
            if (!row) return sync.deleteOrg(slug)
            if (row.isAdmin === null) return sync.removeMembership(slug, clerkId)
            return sync.syncMembership(row, clerkId, row.isAdmin)
        },
    )
}

export const syncMembershipToClerk = reconcileMembership
export const removeMembershipFromClerk = reconcileMembership
