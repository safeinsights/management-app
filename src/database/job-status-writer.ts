// The only module that writes job_status_change or opens a study_job (OTTER-973). It imports only kysely,
// the generated types, src/lib leaf modules and its own migration, by relative path, so a seed in the
// migrator bundle can call it: `@/database` would pull in `@/server/config`, which that bundle cannot load.
import { sql, type Kysely, type Transaction } from 'kysely'
import type { DB } from './types'
import { ActionFailure, NotFoundError } from '../lib/errors'
import {
    decideJobTransition,
    isRoundClosing,
    type JobActor,
    type JobStatus,
    type TransitionRefusal,
} from '../lib/job-status-rules'
import { JOB_WRITER_FLAG } from './migrations/1793742916584_study_job_current_status'

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

export type JobState = { status: JobStatus; round: number; statusChangedAt: Date }

async function readLockedJobState(trx: Transaction<DB>, jobId: string) {
    return trx
        .selectFrom('studyJob')
        .select(['currentStatus as status', 'round', 'statusChangedAt'])
        .where('id', '=', jobId)
        .forUpdate()
        .executeTakeFirstOrThrow()
}

// For a write path that decides before it writes: the job's stored state, under the same locks as the writer.
export async function lockJobState(executor: Executor, jobId: string): Promise<JobState & { studyId: string }> {
    return inTransaction(executor, async (trx) => {
        const { studyId } = await lockJobForTransition(trx, jobId)
        const { status, round, statusChangedAt } = await readLockedJobState(trx, jobId)
        return { studyId, status, round, statusChangedAt }
    })
}

// The time of a status row, copied in SQL so the stored time keeps its microseconds.
const statusRowTime = (statusChangeId: string) =>
    sql<Date>`(SELECT created_at FROM job_status_change WHERE id = ${statusChangeId}::uuid)`

// Migration 1793904779051 drops the triggers, but a deploy swaps the code before it migrates, so they skip
// inserts under this flag until then. Switched off after the insert, as the app's transaction may go on.
async function insertAsWriter<T>(trx: Transaction<DB>, insert: () => Promise<T>): Promise<T> {
    await sql`SELECT set_config(${JOB_WRITER_FLAG}, 'on', true)`.execute(trx)
    const result = await insert()
    await sql`SELECT set_config(${JOB_WRITER_FLAG}, 'off', true)`.execute(trx)
    return result
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
        const { status: from } = await readLockedJobState(trx, jobId)
        const rows = await trx
            .selectFrom('jobStatusChange')
            .select(['id', 'status', 'message'])
            .where('studyJobId', '=', jobId)
            .orderBy('createdAt')
            .orderBy('id')
            .execute()
        const decision = decideJobTransition({
            from,
            to,
            actor,
            newestStatus: rows.at(-1)?.status ?? null,
            hasStatus: (status) => rows.some((row) => row.status === status),
        })

        if (decision.kind === 'refused') throw new JobTransitionRefusedError(jobId, from, to, actor, decision.reason)

        if (decision.kind === 'repeat') {
            const existing = rows.findLast((row) => row.status === to)
            return {
                outcome: 'repeat',
                studyId,
                from,
                observed: false,
                existing: existing && { id: existing.id, message: existing.message },
            }
        }
        if (decision.kind === 'noop') return { outcome: 'noop', studyId, from, observed: false }

        // clock_timestamp(), not the now() default: now() is fixed for the whole transaction, so two
        // writes in one transaction would tie.
        const inserted = await insertAsWriter(trx, () =>
            trx
                .insertInto('jobStatusChange')
                .values({
                    studyJobId: jobId,
                    status: to,
                    userId,
                    message,
                    createdAt: at ?? sql<Date>`clock_timestamp()`,
                })
                .returning('id')
                .executeTakeFirstOrThrow(),
        )

        const moved = decision.effect === 'move'
        if (moved) {
            await trx
                .updateTable('studyJob')
                .set({
                    currentStatus: to,
                    statusChangedAt: statusRowTime(inserted.id),
                    ...(decision.roundIncrement ? { round: sql<number>`round + 1` } : {}),
                })
                .where('id', '=', jobId)
                .execute()
        }

        return {
            outcome: moved ? 'moved' : 'logged',
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
    // A fixed job id for seeded fixtures whose file paths embed it. QA only.
    id?: string
}

export async function openStudyJob(
    executor: Executor,
    studyId: string,
    { actor, createdAt, at, id }: OpenStudyJobOptions,
): Promise<{ id: string; createdAt: Date; statusChangeId: string; round: number }> {
    if (at && actor !== 'qa') throw new Error('only a qa write may set its own timestamp')
    if (id && actor !== 'qa') throw new Error('only a qa write may set its own job id')

    return inTransaction(executor, async (trx) => {
        // Serializes job opens on one study, so two requests cannot both open the next round.
        await trx.selectFrom('study').select('id').where('id', '=', studyId).forUpdate().execute()
        const latest = await trx
            .selectFrom('studyJob')
            .select(['round', 'currentStatus'])
            .where('studyId', '=', studyId)
            .orderBy('round', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst()
        // From the stored rounds rather than the log, so a new job never numbers below the jobs before it.
        const round = latest ? latest.round + (isRoundClosing(latest.currentStatus) ? 1 : 0) : 1
        const { job, initiated } = await insertAsWriter(trx, async () => {
            const job = await trx
                .insertInto('studyJob')
                .values({ studyId, round, ...(createdAt ? { createdAt } : {}), ...(id ? { id } : {}) })
                .returning(['id', 'createdAt'])
                .executeTakeFirstOrThrow()
            const initiated = await trx
                .insertInto('jobStatusChange')
                .values({ studyJobId: job.id, status: 'INITIATED', createdAt: at ?? sql<Date>`clock_timestamp()` })
                .returning('id')
                .executeTakeFirstOrThrow()
            return { job, initiated }
        })
        await trx
            .updateTable('studyJob')
            .set({ currentStatus: 'INITIATED', statusChangedAt: statusRowTime(initiated.id) })
            .where('id', '=', job.id)
            .execute()
        return { id: job.id, createdAt: job.createdAt, statusChangeId: initiated.id, round }
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
