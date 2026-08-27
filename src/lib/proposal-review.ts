import type { StudyStatus } from '@/database/types'

/**
 * The cap on a Data Partner's written decision, in characters (OTTER-737).
 *
 * One value for both review steps. They used to differ (500 words on the proposal review, 300 on
 * the code review) and the card gives the same 1800 for each, so there is nothing left for a
 * second constant to express.
 */
export const REVIEW_FEEDBACK_MAX_CHARACTERS = 1800

/**
 * The name this field goes by in its own error message.
 *
 * "Decision" is what the card calls it on both review pages, and it is the name the reviewer sees:
 * the proposal page heads the section with the review round and the code page with "Code review",
 * so neither has a field labeled "Feedback" for an error to point at.
 */
export const REVIEW_FEEDBACK_FIELD_TITLE = 'Decision'

/**
 * The Data Partner proposal review section title.
 * First submission reads "Review proposal"; each resubmission bumps the suffix: v2.0, v3.0 etc.
 */
export function proposalReviewHeading(reviewVersion: number): string {
    return reviewVersion > 1 ? `Review proposal v${reviewVersion}.0` : 'Review proposal'
}

export const SUBMITTED_PROPOSAL_REVIEW_STATUSES = [
    'APPROVED',
    'CHANGE-REQUESTED',
    'REJECTED',
] as const satisfies readonly StudyStatus[]

export function isSubmittedProposalReviewStatus(status: StudyStatus): boolean {
    return SUBMITTED_PROPOSAL_REVIEW_STATUSES.includes(status as (typeof SUBMITTED_PROPOSAL_REVIEW_STATUSES)[number])
}
