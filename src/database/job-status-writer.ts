// The only module that writes job_status_change or opens a study_job (OTTER-973). It imports only kysely,
// the generated types, src/lib leaf modules and its own migration, by relative path, so a seed in the
// migrator bundle can call it: `@/database` would pull in `@/server/config`, which that bundle cannot load.
import { sql, type Kysely, type Transaction } from 'kysely'
import type { DB } from './types'
import { ActionFailure, NotFoundError } from '../lib/errors'
import { decideJobTransition, type JobActor, type JobStatus, type TransitionRefusal } from '../lib/job-status-rules'
import { backfillStudyJobState } from './migrations/1787900000000_study_job_current_status'

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

export type JobState = { status: JobStatus; round: number; statusChangedAt: Date }

async function readLockedJobState(trx: Transaction<DB>, jobId: string) {
    return trx
        .selectFrom('studyJob')
        .select(['currentStatus as status', 'round', 'statusChangedAt'])
        .select(micros('studyJob.statusChangedAt').as('statusChangedAtMicros'))
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

// Rewrites every job (or one study's) from its log with the migration's backfill, one transaction per job
// so a live writer waits on one lock at most. A repair tool: the migration's triggers keep the columns
// right for every inserted row, so it only finds a job that someone changed by hand.
export async function recomputeJobStates(
    db: Kysely<DB>,
    { studyId, dryRun = false }: { studyId?: string; dryRun?: boolean } = {},
): Promise<Array<{ jobId: string } & JobState>> {
    let query = db.selectFrom('studyJob').select('id').orderBy('id')
    if (studyId) query = query.where('studyId', '=', studyId)
    const changed: Array<{ jobId: string } & JobState> = []
    for (const { id } of await query.execute()) {
        const result = await db
            .transaction()
            .execute(async (trx) => {
                await lockJobForTransition(trx, id)
                const before = await readLockedJobState(trx, id)
                await backfillStudyJobState(trx as unknown as Kysely<unknown>, { jobIds: [id] })
                const after = await readLockedJobState(trx, id)
                const repaired =
                    before.status !== after.status ||
                    before.round !== after.round ||
                    before.statusChangedAtMicros !== after.statusChangedAtMicros
                const state = { status: after.status, round: after.round, statusChangedAt: after.statusChangedAt }
                if (dryRun && repaired) throw new DryRunRollback(state)
                return { state, repaired }
            })
            .catch((error: unknown) => {
                if (error instanceof DryRunRollback) return { state: error.state, repaired: true }
                throw error
            })
        if (result.repaired) changed.push({ jobId: id, ...result.state })
    }
    return changed
}

class DryRunRollback extends Error {
    constructor(readonly state: JobState) {
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
        const inserted = await trx
            .insertInto('jobStatusChange')
            .values({ studyJobId: jobId, status: to, userId, message, createdAt: at ?? sql<Date>`clock_timestamp()` })
            .returning('id')
            .executeTakeFirstOrThrow()

        // The keep_study_job_state trigger stores the status, its time and the round from the row.
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
        const { round } = await trx
            .selectFrom('studyJob')
            .select('round')
            .where('id', '=', job.id)
            .executeTakeFirstOrThrow()
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
