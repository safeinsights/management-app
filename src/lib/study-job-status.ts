import type { StudyJobStatus } from '@/database/types'

export const STUDY_RESULTS_JOB_STATUSES: readonly StudyJobStatus[] = [
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
]

export const isStudyResultsStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && STUDY_RESULTS_JOB_STATUSES.includes(status)

// In pipeline order; furthestStage below depends on it.
const STAGE_PROGRESSION = ['JOB-PACKAGING', 'JOB-READY', 'JOB-PROVISIONING', 'JOB-RUNNING'] as const

export type ExecutionStage = (typeof STAGE_PROGRESSION)[number]

export const STUDY_CODE_RUNNING_JOB_STATUSES: readonly StudyJobStatus[] = STAGE_PROGRESSION

// The one answer to "which enclave stage is this job in". The status log is append-only, so the
// furthest stage present is the current one, whatever order or timestamps the rows carry.
export const furthestStage = (statuses: ReadonlySet<StudyJobStatus>): ExecutionStage | null =>
    [...STAGE_PROGRESSION].reverse().find((stage) => statuses.has(stage)) ?? null

// furthestStage plus the time that stage was entered, for screens that show how long it has run.
export function currentExecutionStage(
    statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }>,
): { status: ExecutionStage; startedAt: Date | string } | null {
    const status = furthestStage(new Set(statusChanges.map((c) => c.status)))
    if (!status) return null
    return { status, startedAt: latestStatusAt(statusChanges, status)! }
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

// Closes a submission round rather than the job: a change request reopens the same job for new code.
// CODE-REJECTED is omitted because reject is terminal (see codeSubmissionVersion).
export const CODE_ROUND_CLOSING_JOB_STATUSES = [
    'CODE-CHANGES-REQUESTED',
    'FILES-APPROVED',
    'FILES-REJECTED',
] as const satisfies readonly StudyJobStatus[]

// Counted rather than read off the latest status: createdAt defaults to now(), which Postgres holds
// fixed for a whole transaction, so statuses written together tie exactly, and v7 ids are not
// monotonic within a millisecond either.
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
// days. The latest CODE-SUBMITTED event is what anchors "this round" for the generation timeout and
// the "Submitted/Resubmitted on" label. Scanned for the max rather than trusting array order, so an
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
