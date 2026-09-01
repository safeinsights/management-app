import type { StudyStatus } from '@/database/types'

export const REVIEW_FEEDBACK_MAX_CHARACTERS = 1800

// "Decision" is what the reviewer sees on both review pages; neither labels a field "Feedback".
export const REVIEW_FEEDBACK_FIELD_TITLE = 'Decision'

export const SUBMITTED_PROPOSAL_REVIEW_STATUSES = [
    'APPROVED',
    'CHANGE-REQUESTED',
    'REJECTED',
] as const satisfies readonly StudyStatus[]

export function isSubmittedProposalReviewStatus(status: StudyStatus): boolean {
    return SUBMITTED_PROPOSAL_REVIEW_STATUSES.includes(status as (typeof SUBMITTED_PROPOSAL_REVIEW_STATUSES)[number])
}
