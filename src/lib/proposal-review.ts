import type { StudyStatus } from '@/database/types'
import { SUBMITTED_PROPOSAL_REVIEW_STATUSES } from '@/lib/job-status-rules'

export const REVIEW_FEEDBACK_MAX_CHARACTERS = 1800

// "Decision" is what the reviewer sees on both review pages; neither labels a field "Feedback".
export const REVIEW_FEEDBACK_FIELD_TITLE = 'Decision'

export const REVIEW_SELECT_OPTION_ERROR = 'Select an option before submitting.'
export const CODE_EVALUATION_CRITERIA_ERROR = 'Select an answer for each criterion.'

/**
 * The Data Partner proposal review section title.
 * First submission reads "Review proposal"; each resubmission bumps the suffix: v2.0, v3.0 etc.
 */
export function proposalReviewHeading(reviewVersion: number): string {
    return reviewVersion > 1 ? `Review proposal v${reviewVersion}.0` : 'Review proposal'
}

export { SUBMITTED_PROPOSAL_REVIEW_STATUSES }

export function isSubmittedProposalReviewStatus(status: StudyStatus): boolean {
    return SUBMITTED_PROPOSAL_REVIEW_STATUSES.includes(status as (typeof SUBMITTED_PROPOSAL_REVIEW_STATUSES)[number])
}
