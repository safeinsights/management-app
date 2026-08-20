import type { ReviewDecision, StudyJobStatus } from '@/database/types'
import { ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

// OTTER-675: the Data Partner's decision on a job's decrypted outputs.
export type OutputsDecision = 'share-outputs' | 'share-feedback-only'

export const OUTPUTS_DECISIONS: readonly OutputsDecision[] = ['share-outputs', 'share-feedback-only']

// Sharing the files is an approval of the outputs; withholding them asks the lab to revise the
// code, which is NEEDS-CLARIFICATION, not REJECT. Reject is the terminal "this study is over"
// decision and the copy explicitly invites a resubmission ("so {lab} can revise the code").
const OUTPUTS_DECISION_TO_REVIEW: Record<OutputsDecision, ReviewDecision> = {
    'share-outputs': 'APPROVE',
    'share-feedback-only': 'NEEDS-CLARIFICATION',
}

export const toOutputsReviewDecision = (decision: OutputsDecision): ReviewDecision =>
    OUTPUTS_DECISION_TO_REVIEW[decision]

export const OUTPUTS_FEEDBACK_MIN_WORDS = 1

/**
 * Feedback length caps, keyed by the run outcome being reviewed. An errored run gets the shorter
 * cap because the reviewer is explaining a failure, not summarizing results.
 */
export const ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS = 300
export const COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS = 1500

/**
 * Job statuses whose outputs a reviewer may decide on: the run reached a terminal result but no
 * decision has closed it yet. This is STUDY_RESULTS_JOB_STATUSES minus the round-closing pair,
 * spelled out because the two-element list reads clearer than the subtraction.
 */
export const OUTPUTS_REVIEWABLE_JOB_STATUSES: readonly StudyJobStatus[] = ['JOB-ERRORED', 'RUN-COMPLETE']

// These read a job's status history, which arrives from queries whose select shape widens the
// status type, so they take plain strings and compare against the typed constants above.
const includesStatus = (jobStatuses: readonly string[], wanted: readonly StudyJobStatus[]) =>
    jobStatuses.some((status) => (wanted as readonly string[]).includes(status))

/** Whether the run has reached a terminal result, so its outputs can be decided on at all. */
export const hasReviewableOutputs = (jobStatuses: readonly string[]): boolean =>
    includesStatus(jobStatuses, OUTPUTS_REVIEWABLE_JOB_STATUSES)

/**
 * Whether a files decision has already been recorded, making this job's outcome final. Reuses
 * ROUND_CLOSING_JOB_STATUSES rather than restating the pair: closing the round and deciding the
 * files are the same event, so a second copy of the list could only drift.
 */
export const hasOutputsDecision = (jobStatuses: readonly string[]): boolean =>
    includesStatus(jobStatuses, ROUND_CLOSING_JOB_STATUSES)

/**
 * The authoritative cap for a job, derived from its own status history rather than taken from the
 * request. An errored run is capped shorter; a bare JOB-ERRORED wins when RUN-COMPLETE is also
 * present, matching resultsErrored and reviewer routing — deliberately not the narrower
 * runErrored behind the researcher banner's copy.
 */
export function outputsFeedbackMaxWords(jobStatuses: readonly string[]): number {
    return jobStatuses.includes('JOB-ERRORED')
        ? ERRORED_OUTPUTS_FEEDBACK_MAX_WORDS
        : COMPLETED_OUTPUTS_FEEDBACK_MAX_WORDS
}

// File names are truncated in the table so a long name cannot push the other columns off screen.
export const OUTPUTS_FILE_NAME_MAX_LENGTH = 50

export const OUTPUTS_DECISION_ERRORS = {
    feedbackEmpty: (labName: string) => `Enter your feedback for ${labName} before submitting.`,
    feedbackTooLong: (maxWords: number) => `Feedback exceeds the ${maxWords} word limit. Shorten it to continue.`,
    decisionMissing: 'Select an option before submitting',
} as const
