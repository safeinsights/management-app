// The only module that writes job_status_change or opens a study_job (OTTER-973). It imports only kysely,
// the generated types and src/lib leaf modules, by relative path, so a seed in the migrator bundle can call
// it: `@/database` would pull in `@/server/config`, which that bundle cannot load.
import { sql, type Kysely, type Transaction } from 'kysely'
import type { DB } from './types'
import { ActionFailure, NotFoundError } from '../lib/errors'
import {
    CODE_ROUND_CLOSING_JOB_STATUSES,
    decideJobTransition,
    replayJobStatus,
    sortJobStatusRows,
    type JobActor,
    type JobStatus,
    type TransitionRefusal,
} from '../lib/job-status-rules'

type Executor = Kysely<DB> | Transaction<DB>

export class JobTransitionRefusedError extends ActionFailure {
    name = 'JobTransitionRefusedError'

    constructor(
        readonly jobId: string,
        readonly from: JobStatus | null,
        readonly to: JobStatus,
        readonly actor: JobActor,
        readonly reason: TransitionRefusal,
    ) {
        super({ study: `${REFUSAL_MESSAGES[reason]}. Refresh to see the updated status.` })
    }
}

// Shown to the person whose action was refused; the log line keeps the raw statuses.
const REFUSAL_MESSAGES: Record<TransitionRefusal, string> = {
    repeat: 'already has this status',
    'round-closed': 'has already been decided',
    'not-permitted': 'has changed since this page loaded',
}

export type JobStatusWriteOptions = {
    actor: JobActor
    userId?: string | null
    message?: string | null
    // Backdates the row. QA only: fixtures and scripts place history, the app never does.
    at?: Date
}

export type JobStatusWriteResult = {
    outcome: 'moved' | 'logged' | 'repeat' | 'noop'
    studyId: string
    from: JobStatus | null
    // Written although the table does not permit it, because the sender is in observe mode.
    observed: boolean
    statusChangeId?: string
    // On a repeat: the newest row that already carries the status.
    existing?: { id: string; message: string | null }
}

// Scripts and fixtures pass a plain connection; the app always passes the transaction it runs in.
function inTransaction<T>(executor: Executor, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
    if (executor.isTransaction) return fn(executor as Transaction<DB>)
    // The migrator bundle cannot load withTransaction() from @/server/request-context.
    return executor.transaction().execute(fn)
}

// Study row, then job row, everywhere: the outputs decision and the resubmit lock the study first,
// so the opposite order could deadlock on an errored job.
export async function lockJobForTransition(trx: Transaction<DB>, jobId: string): Promise<{ studyId: string }> {
    const job = await trx.selectFrom('studyJob').select('studyId').where('id', '=', jobId).executeTakeFirst()
    if (!job) throw new NotFoundError({ job: `${jobId} was not found` })
    await trx.selectFrom('study').select('id').where('id', '=', job.studyId).forUpdate().execute()
    await trx.selectFrom('studyJob').select('id').where('id', '=', jobId).forUpdate().execute()
    return { studyId: job.studyId }
}

// Postgres keeps microseconds and a JS Date only milliseconds, so times are compared as text.
const micros = (column: string) => sql<string>`(extract(epoch from ${sql.ref(column)}) * 1000000)::bigint::text`

async function jobStatusRows(trx: Transaction<DB>, jobId: string) {
    const rows = await trx
        .selectFrom('jobStatusChange')
        .select(['id', 'status', 'message', 'createdAt'])
        .select(micros('jobStatusChange.createdAt').as('createdAtMicros'))
        .where('studyJobId', '=', jobId)
        .execute()
    return sortJobStatusRows(rows)
}

// The code round of a job: round-closing rows on the jobs before it, plus its own resubmissions.
// Submissions and change requests alternate on a job, so its Nth submission is round N of its own.
function jobRoundSql(jobId: string) {
    return sql<number>`(
        1 + (
            SELECT count(*)
            FROM job_status_change closer
            JOIN study_job sibling ON sibling.id = closer.study_job_id
            JOIN study_job job ON job.id = ${jobId}::uuid
            WHERE sibling.study_id = job.study_id
              AND (sibling.created_at, sibling.id) < (job.created_at, job.id)
              AND closer.status = ANY(${CODE_ROUND_CLOSING_JOB_STATUSES}::study_job_status[])
        ) + greatest(0, (
            SELECT count(*)
            FROM job_status_change submission
            WHERE submission.study_job_id = ${jobId}::uuid
              AND submission.status = 'CODE-SUBMITTED'
        ) - 1)
    )::int`
}

export type JobState = { status: JobStatus; round: number; statusChangedAt: Date }

// Rewrites the job's columns from its log when they differ. Older app versions write log rows without
// the columns during a deploy, so the log, read under the job lock, is what decides.
async function repairJobState(
    trx: Transaction<DB>,
    jobId: string,
    rows: Awaited<ReturnType<typeof jobStatusRows>>,
): Promise<JobState & { repaired: boolean }> {
    const { status, changedRow } = replayJobStatus(rows)
    const stored = await trx
        .selectFrom('studyJob')
        .select(['currentStatus', 'round', 'statusChangedAt', 'createdAt'])
        .select(micros('studyJob.statusChangedAt').as('statusChangedAtMicros'))
        .select(micros('studyJob.createdAt').as('createdAtMicros'))
        .select(jobRoundSql(jobId).as('computedRound'))
        .where('id', '=', jobId)
        .executeTakeFirstOrThrow()

    const state = {
        status: status ?? 'INITIATED',
        round: stored.computedRound,
        statusChangedAt: changedRow ? new Date(changedRow.createdAt) : stored.createdAt,
    }
    const changedMicros = changedRow?.createdAtMicros ?? stored.createdAtMicros
    const repaired =
        stored.currentStatus !== state.status ||
        stored.round !== state.round ||
        stored.statusChangedAtMicros !== changedMicros
    if (repaired) {
        await trx
            .updateTable('studyJob')
            .set({
                currentStatus: state.status,
                round: state.round,
                // Copied in SQL so the stored time keeps the row's microseconds.
                statusChangedAt: changedRow
                    ? sql<Date>`(SELECT created_at FROM job_status_change WHERE id = ${changedRow.id}::uuid)`
                    : sql<Date>`created_at`,
            })
            .where('id', '=', jobId)
            .execute()
    }
    return { ...state, repaired }
}

// For a write path that decides before it writes: the job's state from its log, with the columns repaired.
export async function resolveJobState(
    executor: Executor,
    jobId: string,
): Promise<JobState & { studyId: string; repaired: boolean }> {
    return inTransaction(executor, async (trx) => {
        const { studyId } = await lockJobForTransition(trx, jobId)
        return { studyId, ...(await repairJobState(trx, jobId, await jobStatusRows(trx, jobId))) }
    })
}

// Repairs every job (or one study's), one transaction per job so a live writer waits on one lock at most.
export async function recomputeJobStates(
    db: Kysely<DB>,
    { studyId, dryRun = false }: { studyId?: string; dryRun?: boolean } = {},
): Promise<Array<{ jobId: string } & JobState>> {
    let query = db.selectFrom('studyJob').select('id').orderBy('id')
    if (studyId) query = query.where('studyId', '=', studyId)
    const changed: Array<{ jobId: string } & JobState> = []
    for (const { id } of await query.execute()) {
        const state = await db
            .transaction()
            .execute(async (trx) => {
                const result = await resolveJobState(trx, id)
                if (dryRun && result.repaired) throw new DryRunRollback(result)
                return result
            })
            .catch((error: unknown) => {
                if (error instanceof DryRunRollback) return error.state
                throw error
            })
        if (state.repaired)
            changed.push({
                jobId: id,
                status: state.status,
                round: state.round,
                statusChangedAt: state.statusChangedAt,
            })
    }
    return changed
}

class DryRunRollback extends Error {
    constructor(readonly state: JobState & { repaired: boolean }) {
        super('dry run')
    }
}

export async function writeJobStatus(
    executor: Executor,
    jobId: string,
    to: JobStatus,
    { actor, userId = null, message = null, at }: JobStatusWriteOptions,
): Promise<JobStatusWriteResult> {
    if (at && actor !== 'qa') throw new Error('only a qa write may set its own timestamp')

    return inTransaction(executor, async (trx) => {
        const { studyId } = await lockJobForTransition(trx, jobId)
        const rows = await jobStatusRows(trx, jobId)
        const from = replayJobStatus(rows).status
        const decision = decideJobTransition({
            from,
            to,
            actor,
            newestStatus: rows.at(-1)?.status ?? null,
            hasStatus: (status) => rows.some((row) => row.status === status),
        })

        if (decision.kind === 'refused') throw new JobTransitionRefusedError(jobId, from, to, actor, decision.reason)

        if (decision.kind === 'repeat') {
            await repairJobState(trx, jobId, rows)
            const existing = rows.findLast((row) => row.status === to)
            return {
                outcome: 'repeat',
                studyId,
                from,
                observed: false,
                existing: existing && { id: existing.id, message: existing.message },
            }
        }
        if (decision.kind === 'noop') {
            await repairJobState(trx, jobId, rows)
            return { outcome: 'noop', studyId, from, observed: false }
        }

        // clock_timestamp(), not the now() default: now() is fixed for the whole transaction, so two
        // writes in one transaction would tie and the replay could not tell which came first.
        const inserted = await trx
            .insertInto('jobStatusChange')
            .values({ studyJobId: jobId, status: to, userId, message, createdAt: at ?? sql<Date>`clock_timestamp()` })
            .returning('id')
            .executeTakeFirstOrThrow()
        await repairJobState(trx, jobId, await jobStatusRows(trx, jobId))

        return {
            outcome: decision.effect === 'move' ? 'moved' : 'logged',
            studyId,
            from,
            observed: decision.observed,
            statusChangeId: inserted.id,
        }
    })
}

export type OpenStudyJobOptions = {
    actor: Extract<JobActor, 'system' | 'qa'>
    createdAt?: Date
    // Backdates the INITIATED row. QA only, as in writeJobStatus.
    at?: Date
}

export async function openStudyJob(
    executor: Executor,
    studyId: string,
    { actor, createdAt, at }: OpenStudyJobOptions,
): Promise<{ id: string; createdAt: Date; statusChangeId: string; round: number }> {
    if (at && actor !== 'qa') throw new Error('only a qa write may set its own timestamp')

    return inTransaction(executor, async (trx) => {
        // Serializes job opens on one study, so two requests cannot both open the next round.
        await trx.selectFrom('study').select('id').where('id', '=', studyId).forUpdate().execute()
        const job = await trx
            .insertInto('studyJob')
            .values(createdAt ? { studyId, createdAt } : { studyId })
            .returning(['id', 'createdAt'])
            .executeTakeFirstOrThrow()
        const initiated = await trx
            .insertInto('jobStatusChange')
            .values({ studyJobId: job.id, status: 'INITIATED', createdAt: at ?? sql<Date>`clock_timestamp()` })
            .returning('id')
            .executeTakeFirstOrThrow()
        const state = await repairJobState(trx, job.id, await jobStatusRows(trx, job.id))
        return { id: job.id, createdAt: job.createdAt, statusChangeId: initiated.id, round: state.round }
    })
}

// One conditional update rather than read-then-write, so a classified reason is never overwritten.
export async function reclassifyJobFailure(
    executor: Executor,
    statusChangeId: string,
    reason: string,
    knownReasons: readonly string[],
) {
    await executor
        .updateTable('jobStatusChange')
        .set({ message: reason })
        .where('id', '=', statusChangeId)
        .where((eb) => eb.or([eb('message', 'is', null), eb('message', 'not in', knownReasons)]))
        .execute()
}

// Deleting the rows would change the state of a job that outlives the user; the audit log keeps them.
export async function detachJobStatusAuthor(executor: Executor, userId: string) {
    await executor.updateTable('jobStatusChange').set({ userId: null }).where('userId', '=', userId).execute()
}
