import type { ReviewDecision, StudyJobStatus } from '@/database/types'
import { overCharacterLimitError } from '@/lib/field-limits'
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

/**
 * The cap on the reviewer's written decision, in characters (OTTER-737).
 *
 * One value for both run outcomes. The cap used to depend on what was being reviewed, 300 words
 * for an errored run and 1500 for a completed one, on the reasoning that explaining a failure
 * needs less room than summarizing results. The card gives a single 1800 for the field, so the
 * outcome no longer changes it, and the cap no longer has to be derived from the job's status
 * history at all.
 */
export const OUTPUTS_FEEDBACK_MAX_CHARACTERS = 1800

/** The name this field goes by in its own error message, matching the "Decision" heading above it. */
export const OUTPUTS_FEEDBACK_FIELD_TITLE = 'Decision'

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

// File names are truncated in the table so a long name cannot push the other columns off screen.
export const OUTPUTS_FILE_NAME_MAX_LENGTH = 50

export const OUTPUTS_DECISION_ERRORS = {
    feedbackEmpty: (labName: string) => `Enter your feedback for ${labName} before submitting.`,
    feedbackTooLong: overCharacterLimitError(OUTPUTS_FEEDBACK_FIELD_TITLE, OUTPUTS_FEEDBACK_MAX_CHARACTERS),
    decisionMissing: 'Select an option before submitting',
} as const
