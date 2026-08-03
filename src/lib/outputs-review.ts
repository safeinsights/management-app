import type { ReviewDecision } from '@/database/types'

// OTTER-675: the Data Partner's decision on a job's decrypted outputs.
export type OutputsDecision = 'share-outputs' | 'share-feedback-only'

export const OUTPUTS_DECISIONS: readonly OutputsDecision[] = ['share-outputs', 'share-feedback-only']

// Sharing the files is an approval of the outputs; withholding them asks the lab to revise the
// code, which is NEEDS-CLARIFICATION, not REJECT — reject is the terminal "this study is over"
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

// File names are truncated in the table so a long name cannot push the other columns off screen.
export const OUTPUTS_FILE_NAME_MAX_LENGTH = 50

export const OUTPUTS_DECISION_ERRORS = {
    feedbackEmpty: (labName: string) => `Enter your feedback for ${labName} before submitting.`,
    feedbackTooLong: (maxWords: number) => `Feedback exceeds the ${maxWords} word limit. Shorten it to continue.`,
    decisionMissing: 'Select an option before submitting',
} as const
