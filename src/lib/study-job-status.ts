import type { StudyJobStatus } from '@/database/types'

// OTTER-538: job statuses for the Study Details page. Covers "results need review"
// (RUN-COMPLETE), "results ready" (FILES-APPROVED), "results rejected" (FILES-REJECTED),
// and the errored variant (JOB-ERRORED). Shared by both the DO review page, the RL view
// page, and the StudyResults panel so the three never drift.
export const STUDY_RESULTS_JOB_STATUSES: readonly StudyJobStatus[] = [
    'RUN-COMPLETE',
    'FILES-APPROVED',
    'FILES-REJECTED',
    'JOB-ERRORED',
]

export const isStudyResultsStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && STUDY_RESULTS_JOB_STATUSES.includes(status)

// Execution window: the code has been approved and is being provisioned/packaged/run in
// the secure enclave, but no results exist yet. These statuses map to the redesigned
// Code-approved page until a results status appears.
export const STUDY_CODE_RUNNING_JOB_STATUSES: readonly StudyJobStatus[] = [
    'JOB-PROVISIONING',
    'JOB-PACKAGING',
    'JOB-READY',
    'JOB-RUNNING',
]

// Code submitted and awaiting a review decision.
export const CODE_UNDER_REVIEW_JOB_STATUSES: readonly StudyJobStatus[] = ['CODE-SUBMITTED', 'CODE-SCANNED']

export const isCodeUnderReviewStatus = (status: StudyJobStatus | undefined): boolean =>
    !!status && CODE_UNDER_REVIEW_JOB_STATUSES.includes(status)

export const hasJobStatus = (
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>,
    statuses: readonly StudyJobStatus[],
) => statusChanges.some((c) => statuses.includes(c.status))

// Job statuses that mean a code-review decision has been recorded. Used to gate the
// post-decision views: the researcher's study view (OTTER on code-post-decision-view) and
// the DO's reviewer page (OTTER-552), so a study opened with a decision lands on the
// post-feedback page rather than the active code-review/decision page.
export type CodeDecisionStatus = 'CODE-APPROVED' | 'CODE-CHANGES-REQUESTED' | 'CODE-REJECTED'

export const CODE_DECISION_JOB_STATUSES: readonly CodeDecisionStatus[] = [
    'CODE-APPROVED',
    'CODE-CHANGES-REQUESTED',
    'CODE-REJECTED',
]

export const isCodeDecisionStatus = (status: StudyJobStatus | undefined): status is CodeDecisionStatus =>
    !!status && CODE_DECISION_JOB_STATUSES.includes(status as CodeDecisionStatus)

// OTTER-552: "does the current round have a live code-review decision?"
//
// The obvious test — isCodeDecisionStatus(statusChanges[0]) — reads the *latest* status, but
// that ordering is non-deterministic: jobStatusChange.createdAt defaults to now() (constant
// within a transaction) so statuses written together tie on createdAt, and v7 ids are not
// reliably monotonic within a millisecond (see mutations.ts getOrCreateCurrentRoundJob). On
// staging a CODE-APPROVED/REJECTED/CHANGES-REQUESTED row written alongside a sibling status
// could sort *behind* it, so the DO fell through to the active code-review page instead of
// the post-feedback page.
//
// Each review round is CODE-SUBMITTED → (decision). Counting is order-independent: when at
// least as many decisions as submissions exist, the latest submission has been decided and the
// DO belongs on the post-feedback page. A resubmission adds a CODE-SUBMITTED with no following
// decision — either on a brand-new job (the current resubmission model, where this job is no
// longer the latest submitted job) or appended to the same job (legacy) — tipping the count
// back so the DO returns to active review. CODE-SCANNED is an automated step between submit and
// decision, not a fresh submission, so it is excluded from the submitted count.
export const latestSubmittedJobHasLiveCodeDecision = (
    statusChanges: ReadonlyArray<{ status: StudyJobStatus }>,
): boolean => {
    const submittedCount = statusChanges.filter((s) => s.status === 'CODE-SUBMITTED').length
    const decisionCount = statusChanges.filter((s) => isCodeDecisionStatus(s.status)).length
    return decisionCount > 0 && decisionCount >= submittedCount
}

// OTTER-552: "is the latest code change a fresh submission awaiting review?"
//
// The single source of truth for reviewer routing, dashboard highlighting, and the dashboard
// pill — all three ask the same question and must not drift. It is the inverse of
// latestSubmittedJobHasLiveCodeDecision, guarded by "a submission exists at all", and reuses
// that helper's order-independent counting on purpose: index-based "which is newer, submission
// or decision?" is unsafe because statuses written together in one transaction tie on createdAt
// (constant now()) and v7 ids aren't reliably monotonic within a millisecond, so a decision and
// a submission sharing a job (the legacy single-job path the tests exercise) could sort either
// way. A resubmission appends CODE-SUBMITTED after the prior round's decision, tipping the
// undecided-submission count back so this returns true while study.status stays APPROVED.
export const latestCodeChangeIsSubmission = (statusChanges: ReadonlyArray<{ status: StudyJobStatus }>): boolean =>
    hasJobStatus(statusChanges, CODE_UNDER_REVIEW_JOB_STATUSES) && !latestSubmittedJobHasLiveCodeDecision(statusChanges)
