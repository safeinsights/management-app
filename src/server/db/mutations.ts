import { Action } from '../actions/action'
import type { DB, StudyJobStatus } from '@/database/types'
import { sql, type Kysely } from 'kysely'
import { canResubmitStudyCode } from '@/lib/code-resubmission'

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

export type RoundJob = { id: string; createdAt: Date; latestStatus: StudyJobStatus | null; created: boolean }

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

    return { id: studyJob.id, createdAt: studyJob.createdAt, latestStatus: 'INITIATED', created: true }
}

/**
 * A study accumulates one studyJob per submission *round*: a round opens when work begins (IDE launch
 * or file upload) and closes once its job reaches a completed/resubmittable state. The latest job is
 * the "current round" unless it has closed, in which case the next launch/submit starts a new round.
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
        .select((eb) =>
            eb
                .selectFrom('jobStatusChange')
                .select('jobStatusChange.status')
                .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .orderBy('jobStatusChange.createdAt', 'desc')
                .orderBy('jobStatusChange.id', 'desc')
                .limit(1)
                .as('latestStatus'),
        )
        .where('studyJob.studyId', '=', studyId)
        // Order by id (v7 = insertion order), NOT createdAt: ensureRoundJobForUpload deliberately
        // backdates a new round job's createdAt (so uploaded files read as newer for submit-enable),
        // which would otherwise rank it *behind* the prior submission and make us open yet another
        // round. id is monotonic with insertion, so the most-recently-created job always wins.
        .orderBy('studyJob.id', 'desc')
        .limit(1)
        .executeTakeFirst()

    const latestStatus = (latest?.latestStatus ?? null) as StudyJobStatus | null
    if (!latest || canResubmitStudyCode(latestStatus)) {
        return createRoundJob(db, studyId, new Date(Date.now() - backdateMs))
    }
    return { id: latest.id, createdAt: latest.createdAt, latestStatus, created: false }
}

// Submit is enabled when any workspace file's mtime > the current round job's createdAt.

/**
 * IDE launch: ensure the current round has a job. When the round is still open work (no submission
 * yet — only INITIATED), re-anchor its createdAt to now so edits made after this launch enable Submit.
 * A round whose job already carries a submission is left untouched. Reuses the round's job rather than
 * stacking a new one (OTTER-601).
 */
export async function ensureRoundJobForLaunch(db: Kysely<DB>, studyId: string): Promise<RoundJob> {
    const job = await getOrCreateCurrentRoundJob(db, studyId)
    if (job.created || job.latestStatus !== 'INITIATED') return job
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
