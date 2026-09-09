import type { StudyJobStatus } from '@/database/types'

export const STUDY_RESULTS_JOB_STATUSES: readonly StudyJobStatus[] = [
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
]

export const isStudyResultsStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && STUDY_RESULTS_JOB_STATUSES.includes(status)

// In pipeline order; STAGE_INDEX below depends on it.
const STAGE_PROGRESSION = ['JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING', 'JOB-RUNNING'] as const

export const STUDY_CODE_RUNNING_JOB_STATUSES: readonly StudyJobStatus[] = STAGE_PROGRESSION

const STAGE_INDEX: ReadonlyMap<StudyJobStatus, number> = new Map(STAGE_PROGRESSION.map((s, i) => [s, i]))

// When timestamps tie, as they do for statuses written in one transaction, the stage furthest
// along the pipeline wins regardless of insertion order.
export function currentExecutionStage(
    statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }>,
): { status: StudyJobStatus; startedAt: Date | string } | null {
    const stages = statusChanges.filter((c) => STUDY_CODE_RUNNING_JOB_STATUSES.includes(c.status))
    if (stages.length === 0) return null
    const rank = (c: (typeof stages)[number]) => new Date(c.createdAt).getTime() * 10 + (STAGE_INDEX.get(c.status) ?? 0)
    const latest = stages.reduce((a, b) => (rank(b) > rank(a) ? b : a))
    return { status: latest.status, startedAt: latest.createdAt }
}

// Raw status rows carry createdAt optionally, so callers filter through this before latestStatusAt.
export const datedStatusChanges = (
    statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt?: Date | string }>,
): Array<{ status: StudyJobStatus; createdAt: Date | string }> =>
    statusChanges.filter((c): c is { status: StudyJobStatus; createdAt: Date | string } => !!c.createdAt)

// Selected by timestamp, not array position: statusChanges ordering differs by query.
export function latestStatusAt(
    statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }>,
    status: StudyJobStatus,
): Date | string | null {
    const matches = statusChanges.filter((c) => c.status === status)
    if (matches.length === 0) return null
    const latest = matches.reduce((a, b) => (new Date(b.createdAt) > new Date(a.createdAt) ? b : a))
    return latest.createdAt
}

export const CODE_UNDER_REVIEW_JOB_STATUSES: readonly StudyJobStatus[] = ['CODE-SUBMITTED', 'CODE-SCANNED']

export const isCodeUnderReviewStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && CODE_UNDER_REVIEW_JOB_STATUSES.includes(status)

export const hasJobStatus = (
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>,
    statuses: readonly StudyJobStatus[],
) => statusChanges.some((c) => statuses.includes(c.status))

export type CodeDecisionStatus = 'CODE-APPROVED' | 'CODE-CHANGES-REQUESTED' | 'CODE-REJECTED'

export const CODE_DECISION_JOB_STATUSES: readonly CodeDecisionStatus[] = [
    'CODE-APPROVED',
    'CODE-CHANGES-REQUESTED',
    'CODE-REJECTED',
]

export const isCodeDecisionStatus = (status: StudyJobStatus | undefined): status is CodeDecisionStatus =>
    !!status && CODE_DECISION_JOB_STATUSES.includes(status as CodeDecisionStatus)

// A round closes only after a post-run results decision; pre-run outcomes and a not-yet-reviewed
// JOB-ERRORED continue the SAME job.
export const ROUND_CLOSING_JOB_STATUSES = [
    'FILES-APPROVED',
    'FILES-REJECTED',
] as const satisfies readonly StudyJobStatus[]

// Counted rather than read off the latest status: statuses written in one transaction tie on
// createdAt, and v7 ids are not monotonic within a millisecond (OTTER-552).
export const latestSubmittedJobHasLiveCodeDecision = (
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>,
): boolean => {
    const submittedCount = statusChanges.filter((s) => s.status === 'CODE-SUBMITTED').length
    const decisionCount = statusChanges.filter((s) => isCodeDecisionStatus(s.status)).length
    return decisionCount > 0 && decisionCount >= submittedCount
}

// A resubmission tips this back to true while study.status stays APPROVED (OTTER-552).
export const latestCodeChangeIsSubmission = (statusChanges: ReadonlyArray<{ status: StudyJobStatus }>): boolean =>
    hasJobStatus(statusChanges, CODE_UNDER_REVIEW_JOB_STATUSES) && !latestSubmittedJobHasLiveCodeDecision(statusChanges)

// A resubmission reuses its study job, so the job's own createdAt can predate the current round by
// days. The latest CODE-SUBMITTED event is the only timestamp that anchors what "this round" means
// — for the generation timeout, the "Submitted/Resubmitted on" label, and whether a stored review
// belongs to the code on screen. Scanned for the max rather than trusting array order, so an
// unsorted caller still gets the newest submission back.
export function latestCodeSubmittedAt(job: {
    createdAt: Date | string
    // Deliberately `string`, not StudyJobStatus: callers pass rows from queries whose status union
    // is wider than the job statuses, and only CODE-SUBMITTED is matched here.
    statusChanges: ReadonlyArray<{ status: string; createdAt: Date | string }>
}): Date | string {
    const submissions = job.statusChanges.filter((change) => change.status === 'CODE-SUBMITTED')
    if (submissions.length === 0) return job.createdAt
    return submissions.reduce((latest, change) =>
        new Date(change.createdAt).getTime() > new Date(latest.createdAt).getTime() ? change : latest,
    ).createdAt
}

// A failure row can be written by a run that started just before the submission it is racing, so it
// is allowed to predate the round by this much. Wide enough for the write to land either side of
// the status row, far short of a previous round.
const FAILURE_ROW_GRACE_MS = 5_000

// attachCodeToRoundJob deletes the review row on resubmit, which is what makes createdAt
// trustworthy: the replacement is a fresh insert, never a rename carrying the old timestamp
// forward.
//
// This closes the leftover-row case, not the concurrent one: generation takes no round token, so a
// previous round's run that finishes after the resubmit still writes a createdAt inside this round
// and passes. Closing that needs the token (OTTER-775 review).
export function reviewForCurrentRound<T extends { createdAt: Date | string; summaryFailedAt: Date | string | null }>(
    review: T | null,
    submittedAt: Date | string,
): T | null {
    if (!review) return null

    const age = new Date(review.createdAt).getTime() - new Date(submittedAt).getTime()
    // persistFailure upserts, so a stale failure can overwrite this round's good report. Trusting
    // failure rows at any age let that surface as a permanent error on current-round code.
    if (review.summaryFailedAt != null) return age >= -FAILURE_ROW_GRACE_MS ? review : null
    return age >= 0 ? review : null
}
