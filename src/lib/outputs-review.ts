import type { ReviewDecision, StudyJobStatus } from '@/database/types'
import { overCharacterLimitError } from '@/lib/field-limits'
import { ROUND_CLOSING_JOB_STATUSES } from '@/lib/study-job-status'

export type OutputsDecision = 'share-outputs' | 'share-feedback-only'

export const OUTPUTS_DECISIONS: readonly OutputsDecision[] = ['share-outputs', 'share-feedback-only']

// Withholding the files invites a resubmission, so it is NEEDS-CLARIFICATION, not the terminal
// REJECT.
const OUTPUTS_DECISION_TO_REVIEW: Record<OutputsDecision, ReviewDecision> = {
    'share-outputs': 'APPROVE',
    'share-feedback-only': 'NEEDS-CLARIFICATION',
}

export const toOutputsReviewDecision = (decision: OutputsDecision): ReviewDecision =>
    OUTPUTS_DECISION_TO_REVIEW[decision]

export const OUTPUTS_FEEDBACK_MAX_CHARACTERS = 1800

export const OUTPUTS_FEEDBACK_FIELD_TITLE = 'Decision'

// STUDY_RESULTS_JOB_STATUSES minus the round-closing pair, spelled out because the two-element
// list reads clearer than the subtraction.
export const OUTPUTS_REVIEWABLE_JOB_STATUSES: readonly StudyJobStatus[] = ['JOB-ERRORED', 'RUN-COMPLETE']

// Takes plain strings because callers' select shapes widen the status type.
const includesStatus = (jobStatuses: readonly string[], wanted: readonly StudyJobStatus[]) =>
    jobStatuses.some((status) => (wanted as readonly string[]).includes(status))

export const hasReviewableOutputs = (jobStatuses: readonly string[]): boolean =>
    includesStatus(jobStatuses, OUTPUTS_REVIEWABLE_JOB_STATUSES)

// Closing the round and deciding the files are the same event, so this reuses
// ROUND_CLOSING_JOB_STATUSES rather than restating the pair.
export const hasOutputsDecision = (jobStatuses: readonly string[]): boolean =>
    includesStatus(jobStatuses, ROUND_CLOSING_JOB_STATUSES)

export const OUTPUTS_FILE_NAME_MAX_LENGTH = 50

export const OUTPUTS_DECISION_ERRORS = {
    feedbackEmpty: (labName: string) => `Enter your feedback for ${labName} before submitting.`,
    feedbackTooLong: overCharacterLimitError(OUTPUTS_FEEDBACK_FIELD_TITLE, OUTPUTS_FEEDBACK_MAX_CHARACTERS),
    decisionMissing: 'Select an option before submitting',
} as const
