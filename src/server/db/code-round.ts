import { db, type DBExecutor } from '@/database'
import { throwNotFound } from '@/lib/errors'
import { CODE_ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

// The round of the code currently attached to a job, which is the round of its latest submission.
// codeSubmissionVersion moves on the moment a reviewer requests changes, which is too early for a
// result that describes the code still on the job: a scan or a summary landing in that window
// belongs to the round that produced it (OTTER-779).
//
// Counted rather than compared against the latest submission's timestamp: createdAt defaults to
// now(), which Postgres holds fixed for a whole transaction, so a change request and the resubmit
// it triggered carry byte-identical timestamps whenever one transaction writes both, and the change
// request drops out of that comparison. Submissions and change requests strictly alternate on a job
// (markCodeSubmitted enforces it), so its Nth submission follows N-1 of its own change requests.
export async function codeRoundForJob(studyJobId: string, executor: DBExecutor = db): Promise<number> {
    // One query rather than a lookup and an aggregate, because the review screen derives the round
    // on every render. `sibling` widens the rows to every job of the study; grouping on the job
    // makes a missing id an empty result instead of a row of zeroes.
    const counts = await executor
        .selectFrom('studyJob as job')
        .innerJoin('studyJob as sibling', 'sibling.studyId', 'job.studyId')
        .leftJoin('jobStatusChange as change', 'change.studyJobId', 'sibling.id')
        .select((eb) => [
            eb.fn
                .count<number>('change.id')
                .filterWhere('change.status', 'in', CODE_ROUND_CLOSING_JOB_STATUSES)
                // Jobs that precede this one only. A results decision opens a fresh job and the
                // round has to keep climbing across that boundary (OTTER-556/558), but a decision
                // on a later job belongs to a later round: counting it would raise this job's round
                // after the fact and put its own stored rows out of reach.
                .filterWhere(
                    eb.or([
                        eb('sibling.createdAt', '<', eb.ref('job.createdAt')),
                        eb.and([
                            eb('sibling.createdAt', '=', eb.ref('job.createdAt')),
                            eb('sibling.id', '<', eb.ref('job.id')),
                        ]),
                    ]),
                )
                .as('closedElsewhere'),
            eb.fn
                .count<number>('change.id')
                .filterWhere('sibling.id', '=', eb.ref('job.id'))
                .filterWhere('change.status', '=', 'CODE-SUBMITTED')
                .as('submissions'),
        ])
        .where('job.id', '=', studyJobId)
        .groupBy('job.id')
        .executeTakeFirstOrThrow(throwNotFound(`study job ${studyJobId}`))

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
