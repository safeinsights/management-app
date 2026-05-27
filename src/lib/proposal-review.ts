import type { StudyStatus } from '@/database/types'

export const FEEDBACK_MIN_WORDS = 1
export const FEEDBACK_MAX_WORDS = 500
export const CODE_REVIEW_FEEDBACK_MAX_WORDS = 300

export const SUBMITTED_PROPOSAL_REVIEW_STATUSES = [
    'APPROVED',
    'CHANGE-REQUESTED',
    'REJECTED',
] as const satisfies readonly StudyStatus[]

export function isSubmittedProposalReviewStatus(status: StudyStatus): boolean {
    return SUBMITTED_PROPOSAL_REVIEW_STATUSES.includes(status as (typeof SUBMITTED_PROPOSAL_REVIEW_STATUSES)[number])
}
