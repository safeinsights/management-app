import { Action } from '../actions/action'
import type { DB, StudyJobStatus } from '@/database/types'
import { sql, type Kysely } from 'kysely'
import { ROUND_CLOSING_JOB_STATUSES, latestSubmittedJobHasLiveCodeDecision } from '@/lib/study-job-status'

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
 * or file upload) and closes only when its job reaches a post-run results decision (FILES-APPROVED /
 * FILES-REJECTED — see ROUND_CLOSING_JOB_STATUSES). Change-requested/errored rounds stay on the same
 * job. The latest job is the "current round" unless it has closed, in which case the next
 * launch/submit starts a new round.
 *
 * This is the single source of truth for "which job does this study's in-progress work belong to" —
 * shared by IDE launch, file upload, and code submission so they all converge on the same job instead
 * of each minting its own (which is what let an empty IDE-init job mask a real submission, OTTER-601).
 *
 * `created` distinguishes a freshly-opened round from a reused one so callers can decide whether to
 * re-anchor the submit-enable timestamp or overwrite a prior submission's files.
 */
export async function getOrCreateCurrentRoundJob(
    db: Kysely<DB>,
    studyId: string,
    { backdateMs = 0 }: { backdateMs?: number } = {},
): Promise<RoundJob> {
    const latest = await db
        .selectFrom('studyJob')
        .select(['studyJob.id as id', 'studyJob.createdAt as createdAt'])
        // Order by id (v7 = insertion order), NOT createdAt: ensureRoundJobForUpload deliberately
        // backdates a new round job's createdAt (so uploaded files read as newer for submit-enable),
        // which would otherwise rank it *behind* the prior submission and make us open yet another
        // round. id is monotonic with insertion, so the most-recently-created job always wins.
        .where('studyJob.studyId', '=', studyId)
        .orderBy('studyJob.id', 'desc')
        .limit(1)
        .executeTakeFirst()

    if (!latest) {
        return createRoundJob(db, studyId, new Date(Date.now() - backdateMs))
    }

    // The reuse-vs-new-round decision reads the latest job's status SET, never a "latest status"
    // lookup: jobStatusChange.createdAt defaults to now() (constant within a transaction) so statuses
    // written together tie on createdAt, and v7 ids aren't reliably monotonic within a millisecond —
    // ordering by them to pick "the latest status" is non-deterministic. Set-based tests below are
    // order-independent.
    const statusChanges = await db
        .selectFrom('jobStatusChange')
        .select('status')
        .where('studyJobId', '=', latest.id)
        .execute()
    const statuses = statusChanges.map((c) => c.status as StudyJobStatus)

    // A round-closing status (FILES-APPROVED/FILES-REJECTED) is never followed by another status on
    // the same job, so "has any round-closing status" is an order-independent test for a closed round.
    const roundClosed = statuses.some((s) => (ROUND_CLOSING_JOB_STATUSES as readonly StudyJobStatus[]).includes(s))
    const hasSubmission = statuses.some((s) => s !== 'INITIATED')
    // OTTER-636: a live CODE-CHANGES-REQUESTED decision opens a NEW draft round on the researcher's
    // next real edit (IDE launch / upload / delete on the Edit Study Code page), so the study reads
    // "Code draft" while they work rather than holding "Change requested". Narrowly scoped to
    // change-requested: CODE-APPROVED (code is running / may have errored, awaiting the reviewer's
    // files decision) and terminal CODE-REJECTED are not researcher-editable and keep the same job;
    // results decisions (FILES-*) are already handled by roundClosed.
    const liveDecision = latestSubmittedJobHasLiveCodeDecision(statuses.map((status) => ({ status })))
    const liveChangesRequested =
        liveDecision &&
        statuses.includes('CODE-CHANGES-REQUESTED') &&
        !statuses.includes('CODE-APPROVED') &&
        !statuses.includes('CODE-REJECTED')

    if (roundClosed || liveChangesRequested) {
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
