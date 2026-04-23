import type { StudyStatus } from '@/database/types'

export type Decision = 'approve' | 'needs-clarification' | 'reject'

export const FEEDBACK_MIN_WORDS = 50
export const FEEDBACK_MAX_WORDS = 500

export const SUBMITTED_PROPOSAL_REVIEW_STATUSES = [
    'APPROVED',
    'PROPOSAL-CHANGE-REQUESTED',
    'REJECTED',
] as const satisfies readonly StudyStatus[]

export function isSubmittedProposalReviewStatus(status: StudyStatus): boolean {
    return SUBMITTED_PROPOSAL_REVIEW_STATUSES.includes(status as (typeof SUBMITTED_PROPOSAL_REVIEW_STATUSES)[number])
}
