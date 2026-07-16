import { Action } from '../actions/action'
import type { DB, StudyJobStatus } from '@/database/types'
import { sql, type Kysely } from 'kysely'
import { isCodeRevisionEntry } from '@/lib/study-screen/code-predicates'

type SiUserOptionalAttrs = {
    firstName?: string | null
    lastName?: string | null
    email?: string | null
}

export const findOrCreateSiUserId = async (clerkId: string, attrs: SiUserOptionalAttrs = {}) => {
    let user = await Action.db.selectFrom('user').select('id').where('clerkId', '=', clerkId).executeTakeFirst()

    if (!user) {
        user = await Action.db
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

export type RoundJob = {
    id: string
    createdAt: Date
    /** True once the round's job carries a real submission (any status beyond the initial INITIATED). */
    hasSubmission: boolean
    /** True when this call inserted a brand-new round job (vs. reusing the current one). */
    created: boolean
}

async function createRoundJob(db: Kysely<DB>, studyId: string, createdAt: Date): Promise<RoundJob> {
    const studyJob = await db
        .insertInto('studyJob')
        .values({ studyId, createdAt })
        .returning(['id', 'createdAt'])
        .executeTakeFirstOrThrow()

    await db
        .insertInto('jobStatusChange')
        .values({ studyJobId: studyJob.id, status: 'INITIATED' })
        .executeTakeFirstOrThrow()

    return { id: studyJob.id, createdAt: studyJob.createdAt, hasSubmission: false, created: true }
}

/**
 * A study accumulates one studyJob per submission *round*: a round opens when work begins (IDE launch
 * or file upload) and stays the current round until a review decision lands on it. Once the latest
 * round is one the researcher may revise from — a live CODE-CHANGES-REQUESTED, a bare JOB-ERRORED, or a
 * results decision (FILES-APPROVED/FILES-REJECTED); see isCodeRevisionEntry — the next real action opens
 * a FRESH INITIATED round, so reviewed history stays immutable and the study reads "Code draft"
 * (OTTER-636). An un-reviewed round (INITIATED-only, or CODE-SUBMITTED still awaiting a decision) is
 * reused. Terminal CODE-REJECTED and a normal CODE-APPROVED (provisioning/running) are not revised.
 *
 * This is the single source of truth for "which job does this study's in-progress work belong to" —
 * shared by IDE launch, file upload, delete, and code submission so they all converge on one job
 * instead of each minting its own (OTTER-601), and at most one open draft round exists per study.
 *
 * `created` distinguishes a freshly-opened round from a reused one so callers can decide whether to
 * re-anchor the submit-enable timestamp or overwrite a prior submission's files.
 */
export async function getOrCreateCurrentRoundJob(
    db: Kysely<DB>,
    studyId: string,
    { backdateMs = 0 }: { backdateMs?: number } = {},
): Promise<RoundJob> {
    // OTTER-636 (Finding 10): serialize round creation per study so concurrent launch/upload/delete/
    // submit can't each read "no open round" and mint duplicates that split files/notes/scans across
    // jobs. Transaction-scoped — the mutating actions that call this run inside a transaction.
    await sql`select pg_advisory_xact_lock(hashtext(${studyId}))`.execute(db)

    const latest = await db
        .selectFrom('studyJob')
        .select(['studyJob.id as id', 'studyJob.createdAt as createdAt'])
        .where('studyJob.studyId', '=', studyId)
        // Round identity is v7 id order (insertion order), NOT createdAt: ensureRoundJobForUpload
        // deliberately backdates a new round's createdAt for file-mtime/submit-enable, so createdAt is
        // presentation metadata only and must not decide which round is current (OTTER-636 Finding 11).
        .orderBy('studyJob.id', 'desc')
        .limit(1)
        .executeTakeFirst()

    if (!latest) {
        return createRoundJob(db, studyId, new Date(Date.now() - backdateMs))
    }

    // Status SET of the latest round (order-independent). jobStatusChange.createdAt defaults to now()
    // (constant within a transaction) and v7 ids aren't reliably monotonic within a millisecond, so a
    // "latest status" lookup would be non-deterministic; the revision-entry test reads the set.
    const statusRows = await db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('studyJobId', '=', latest.id)
        .execute()
    const statuses = statusRows.map((r) => r.status as StudyJobStatus)
    const hasSubmission = statuses.some((s) => s !== 'INITIATED')

    if (isCodeRevisionEntry(statuses)) {
        return createRoundJob(db, studyId, new Date(Date.now() - backdateMs))
    }
    return { id: latest.id, createdAt: latest.createdAt, hasSubmission, created: false }
}

// Submit is enabled when any workspace file's mtime > the current round job's createdAt.

interface EnsureRoundJobForLaunchOptions {
    /**
     * Whether the workspace already holds researcher-visible files. When true, the re-anchor below is
     * skipped: those files (e.g. a manual upload made before opening the IDE) already define
     * submit-enable, and pushing createdAt past their mtimes would mark them all stale — flipping
     * "Last updated" to Never and disabling Submit (OTTER-602).
     */
    hasWorkspaceFiles?: boolean
}

/**
 * IDE launch: ensure the current round has a job. When the round is still open work (no submission
 * yet — only INITIATED) and has no files yet, re-anchor its createdAt to now so edits made after this
 * launch enable Submit. A round whose job already carries a submission — or that already has uploaded
 * files — is left untouched. Reuses the round's job rather than stacking a new one (OTTER-601, OTTER-602).
 */
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

/**
 * File upload: ensure the current round has a job, backdated so files written immediately after still
 * register as newer than its createdAt. Reuses the round's job rather than creating a new one.
 */
export async function ensureRoundJobForUpload(db: Kysely<DB>, studyId: string): Promise<RoundJob> {
    return getOrCreateCurrentRoundJob(db, studyId, { backdateMs: 1000 })
}

/**
 * Returns the createdAt of the most recent studyJob for this study, or null if none exists.
 * Used by starter-file copy paths to backdate file mtimes relative to the baseline, regardless of
 * how long the workspace took to become ready (a wall-clock backdate is unsafe when provisioning
 * exceeds the backdate window — see OTTER-547).
 */
export async function latestStudyJobCreatedAt(db: Kysely<DB>, studyId: string): Promise<Date | null> {
    const row = await db
        .selectFrom('studyJob')
        .select('createdAt')
        .where('studyId', '=', studyId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .executeTakeFirst()
    return row?.createdAt ?? null
}

// Reviewer feedback shares the version of the proposal it reviews (increment=false)
// Researcher resubmission opens a new version (increment=true)
export function nextVersionForStudyComment({ studyId, increment }: { studyId: string; increment: boolean }) {
    const current = sql<number>`coalesce((
        select max(version) from study_proposal_comment
        where study_id = ${studyId}
    ), 1)`
    return increment ? sql<number>`${current} + 1` : current
}
