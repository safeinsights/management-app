import { currentDb } from '@/server/request-context'
import { clerkOrgSyncEnabled } from '@/server/config'
import type { createClerkOrgSync } from '@/lib/clerk-org-sync-core'
import { throwNotFound } from '@/lib/errors'
import type { DB } from '@/database/types'
import { sql, type Kysely, type Updateable } from 'kysely'
import { isRoundClosing } from '@/lib/job-status-rules'
import { openStudyJob } from '@/database/job-status-writer'
import { latestJobQuery } from '@/server/db/latest-job'

type SiUserOptionalAttrs = {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
}

export const findOrCreateSiUserId = async (clerkId: string, attrs: SiUserOptionalAttrs = {}) => {
    const executor = currentDb()
    let user = await executor.selectFrom('user').select('id').where('clerkId', '=', clerkId).executeTakeFirst()

    if (!user) {
        user = await executor
            .insertInto('user')
            .values({
                clerkId,
                lastName: attrs.lastName,
                email: attrs.email,
                firstName: attrs.firstName ?? 'Unknown', // unlike clerk, we require users to have some sort of name for showing in reports
            })
            .returningAll()
            .executeTakeFirstOrThrow()
    }

    return user.id
}

export async function findOrCreateOrgMembership({
    userId,
    slug,
    isAdmin = false,
}: {
    userId: string
    slug: string
    isAdmin?: boolean
}) {
    const executor = currentDb()
    const org = await executor
        .selectFrom('org')
        .select(['org.id', 'org.slug', 'org.name', 'org.type'])
        .where('org.slug', '=', slug)
        .executeTakeFirstOrThrow(throwNotFound(`organization with slug ${slug}`))

    await executor
        .insertInto('orgUser')
        .values({ userId, orgId: org.id, isAdmin })
        .onConflict((oc) => oc.columns(['orgId', 'userId']).doUpdateSet({ isAdmin }))
        .execute()

    return { ...org, isAdmin }
}

// For bin scripts, which cannot load @clerk/nextjs; the sync is passed in. Call it once all of the
// user's memberships are written: unlike the app's sync, a Clerk error throws, so a bin script fails loudly.
export async function syncUserOrgsToClerk(userId: string, clerkSync: ReturnType<typeof createClerkOrgSync>) {
    if (!clerkOrgSyncEnabled()) return
    const executor = currentDb()
    // Clerk must only hear of a committed row, and a caller's open transaction has not committed yet.
    if (executor.isTransaction) throw new Error('cannot sync memberships to Clerk before they commit')
    const memberships = await executor
        .selectFrom('orgUser')
        .innerJoin('org', 'org.id', 'orgUser.orgId')
        .innerJoin('user', 'user.id', 'orgUser.userId')
        .select(['org.slug', 'org.name', 'org.type', 'orgUser.isAdmin', 'user.clerkId'])
        .where('orgUser.userId', '=', userId)
        .execute()
    for (const membership of memberships) {
        await clerkSync.syncMembership(membership, membership.clerkId, membership.isAdmin)
    }
}

export type RoundJob = {
    id: string
    createdAt: Date
    hasSubmission: boolean
    created: boolean
}

async function createRoundJob(db: Kysely<DB>, studyId: string, createdAt: Date): Promise<RoundJob> {
    const studyJob = await openStudyJob(db, studyId, { actor: 'system', createdAt })
    return { id: studyJob.id, createdAt: studyJob.createdAt, hasSubmission: false, created: true }
}

// One studyJob per submission round: a round closes only at a post-run results decision, so
// launch, upload and submit all converge here rather than each minting a job (OTTER-601).
export async function getOrCreateCurrentRoundJob(
    db: Kysely<DB>,
    studyId: string,
    { backdateMs = 0 }: { backdateMs?: number } = {},
): Promise<RoundJob> {
    // Study first, as the status writer locks it, so two requests cannot both open the next round.
    await db.selectFrom('study').select('id').where('id', '=', studyId).forUpdate().execute()
    const latest = await latestJobQuery(db, studyId)
        .select(['studyJob.id as id', 'studyJob.createdAt as createdAt', 'studyJob.currentStatus as currentStatus'])
        .select((eb) =>
            eb
                .exists(
                    eb
                        .selectFrom('jobStatusChange')
                        .select('jobStatusChange.id')
                        .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                        .where('jobStatusChange.status', '!=', 'INITIATED'),
                )
                .as('hasSubmission'),
        )
        .executeTakeFirst()

    // Read under the study lock, which every status write takes first.
    const roundClosed = latest && isRoundClosing(latest.currentStatus)

    if (!latest || roundClosed) {
        return createRoundJob(db, studyId, new Date(Date.now() - backdateMs))
    }
    return { id: latest.id, createdAt: latest.createdAt, hasSubmission: Boolean(latest.hasSubmission), created: false }
}

interface EnsureRoundJobForLaunchOptions {
    // Skips the re-anchor: pushing createdAt past existing files' mtimes would mark them stale and
    // disable Submit (OTTER-602).
    hasWorkspaceFiles?: boolean
}

// Re-anchors createdAt to now when the round carries neither a submission nor files, so edits made
// after this launch enable Submit (OTTER-601, OTTER-602).
export async function ensureRoundJobForLaunch(
    db: Kysely<DB>,
    studyId: string,
    { hasWorkspaceFiles = false }: EnsureRoundJobForLaunchOptions = {},
): Promise<RoundJob> {
    const job = await getOrCreateCurrentRoundJob(db, studyId)
    if (job.created || job.hasSubmission || hasWorkspaceFiles) return job
    const reanchored = await db
        .updateTable('studyJob')
        .set({ createdAt: new Date() })
        .where('id', '=', job.id)
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()
    return { ...job, createdAt: reanchored.createdAt }
}

// Backdated so files written immediately after still register as newer than createdAt.
export async function ensureRoundJobForUpload(db: Kysely<DB>, studyId: string): Promise<RoundJob> {
    return getOrCreateCurrentRoundJob(db, studyId, { backdateMs: 1000 })
}

// The baseline starter-file copies backdate mtimes against; a wall-clock backdate is unsafe when
// provisioning exceeds the backdate window (OTTER-547).
export async function latestStudyJobCreatedAt(db: Kysely<DB>, studyId: string): Promise<Date | null> {
    const row = await latestJobQuery(db, studyId).select('studyJob.createdAt').executeTakeFirst()
    return row?.createdAt ?? null
}

// increment=false for reviewer feedback (shares the proposal's version); true for a resubmission.
export function nextVersionForStudyComment({ studyId, increment }: { studyId: string; increment: boolean }) {
    const current = sql<number>`coalesce((
        select max(version) from study_proposal_comment
        where study_id = ${studyId}
    ), 1)`
    return increment ? sql<number>`${current} + 1` : current
}

// Opening a study and making any change to it count as having seen it (OTTER-838, OTTER-937). The stamp
// never moves back, and `seenAt` covers an edit time taken from the app clock rather than the DB's.
export async function markStudyOpened(
    db: Kysely<DB>,
    { studyId, userId, seenAt }: { studyId: string; userId: string; seenAt?: Date },
) {
    const openedAt = seenAt ? sql<Date>`greatest(clock_timestamp(), ${seenAt})` : sql<Date>`clock_timestamp()`
    await db
        .insertInto('studyLastOpened')
        .values({ studyId, userId, openedAt })
        .onConflict((oc) =>
            oc.columns(['userId', 'studyId']).doUpdateSet((eb) => ({
                openedAt: eb.fn('greatest', [eb.ref('studyLastOpened.openedAt'), eb.ref('excluded.openedAt')]),
            })),
        )
        .execute()
}

// Moves Last updated and stamps the actor's visit together, so their own change never reads as unread (OTTER-937).
export async function markStudyUpdated(
    db: Kysely<DB>,
    { studyId, userId, set = {} }: { studyId: string; userId: string; set?: Updateable<DB['study']> },
) {
    const updatedAt = new Date()
    await db
        .updateTable('study')
        .set({ ...set, lastUpdatedAt: updatedAt })
        .where('id', '=', studyId)
        .execute()
    await markStudyOpened(db, { studyId, userId, seenAt: updatedAt })
}
