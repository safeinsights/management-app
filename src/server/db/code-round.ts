import { db, type DBExecutor } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { CODE_ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

// The round of the code currently attached to a job, which is the round of its latest submission.
// codeSubmissionVersion moves on the moment a reviewer requests changes, which is too early for a
// result that describes the code still on the job: a scan or a summary landing in that window
// belongs to the round that produced it (OTTER-779).
//
// Counted rather than compared against the latest submission's timestamp, because statuses written
// in one transaction tie on createdAt and a change request that ties with the resubmit it triggered
// would drop out of that comparison (OTTER-552). Submissions and change requests strictly alternate
// on a job (markCodeSubmitted enforces it), so its Nth submission follows N-1 of its own change
// requests, and every closer on the study's other jobs predates this job entirely.
export async function codeRoundForJob(studyJobId: string, executor: DBExecutor = db): Promise<number> {
    const { studyId } = await executor
        .selectFrom('studyJob')
        .select('studyId')
        .where('id', '=', studyJobId)
        .executeTakeFirstOrThrow(throwNotFound(`study job ${studyJobId}`))

    // Counted across the study's jobs, not this one: a results decision opens a fresh job, and the
    // round has to keep climbing across that boundary (OTTER-556/558).
    const counts = await executor
        .selectFrom('jobStatusChange')
        .innerJoin('studyJob', 'studyJob.id', 'jobStatusChange.studyJobId')
        .select((eb) => [
            eb.fn
                .count<number>('jobStatusChange.id')
                .filterWhere('jobStatusChange.studyJobId', '!=', studyJobId)
                .filterWhere('jobStatusChange.status', 'in', CODE_ROUND_CLOSING_JOB_STATUSES)
                .as('closedElsewhere'),
            eb.fn
                .count<number>('jobStatusChange.id')
                .filterWhere('jobStatusChange.studyJobId', '=', studyJobId)
                .filterWhere('jobStatusChange.status', '=', 'CODE-SUBMITTED')
                .as('submissions'),
        ])
        .where('studyJob.studyId', '=', studyId)
        .executeTakeFirstOrThrow()

    // A job still waiting for its first submission carries no code of its own, so it reads as the
    // round the study is about to submit, matching codeSubmissionVersion.
    return 1 + Number(counts.closedElsewhere) + Math.max(0, Number(counts.submissions) - 1)
}

export async function isCurrentCodeRound(
    studyJobId: string,
    round: number,
    executor: DBExecutor = db,
): Promise<boolean> {
    return (await codeRoundForJob(studyJobId, executor)) === round
}
