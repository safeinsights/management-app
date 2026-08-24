import type { StudyStatus } from '@/database/types'

/**
 * The cap on a Data Partner's written decision, in characters (OTTER-737).
 *
 * One value for both review steps. They used to differ (500 words on the proposal review, 300 on
 * the code review) and the card gives the same 1800 for each, so there is nothing left for a
 * second constant to express.
 */
export const REVIEW_FEEDBACK_MAX_CHARACTERS = 1800

/** The name this field goes by in its own error message. It is labelled "Feedback" on both pages. */
export const REVIEW_FEEDBACK_FIELD_TITLE = 'Feedback'

export const SUBMITTED_PROPOSAL_REVIEW_STATUSES = [
    'APPROVED',
    'CHANGE-REQUESTED',
    'REJECTED',
] as const satisfies readonly StudyStatus[]

export function isSubmittedProposalReviewStatus(status: StudyStatus): boolean {
    return SUBMITTED_PROPOSAL_REVIEW_STATUSES.includes(status as (typeof SUBMITTED_PROPOSAL_REVIEW_STATUSES)[number])
}
