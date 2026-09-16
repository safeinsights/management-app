import { db, type DBExecutor } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { CODE_ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

// The round of the code currently attached to a job, which is the round of its latest submission.
// codeSubmissionVersion moves on the moment a reviewer requests changes, which is too early for a
// result that describes the code still on the job: a scan or summary landing in that window belongs
// to the round that produced it (OTTER-779).
export async function codeRoundForJob(studyJobId: string, executor: DBExecutor = db): Promise<number> {
    const job = await executor
        .selectFrom('studyJob')
        .select((eb) => [
            'studyJob.studyId',
            eb
                .selectFrom('jobStatusChange')
                .select(({ fn }) => fn.max('jobStatusChange.createdAt').as('at'))
                .whereRef('jobStatusChange.studyJobId', '=', 'studyJob.id')
                .where('jobStatusChange.status', '=', 'CODE-SUBMITTED')
                .as('submittedAt'),
        ])
        .where('studyJob.id', '=', studyJobId)
        .executeTakeFirstOrThrow(throwNotFound(`study job ${studyJobId}`))

    // Counted across the study's jobs, not this one: a results decision opens a fresh job, and the
    // round has to keep climbing across that boundary (OTTER-556/558).
    const closers = await executor
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .select((eb) => eb.fn.countAll().as('count'))
        .where('studyJob.studyId', '=', job.studyId)
        .where('jobStatusChange.status', 'in', CODE_ROUND_CLOSING_JOB_STATUSES)
        // A job awaiting its first submission has no boundary of its own, so every closer so far
        // counts and the answer matches codeSubmissionVersion.
        .where('jobStatusChange.createdAt', '<', job.submittedAt ?? new Date())
        .executeTakeFirst()

    return Number(closers?.count ?? 0) + 1
}

export async function isCurrentCodeRound(
    studyJobId: string,
    round: number,
    executor: DBExecutor = db,
): Promise<boolean> {
    return (await codeRoundForJob(studyJobId, executor)) === round
}
