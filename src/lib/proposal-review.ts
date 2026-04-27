import type { ReviewDecision, StudyStatus } from '@/database/types'

export type Decision = 'approve' | 'needs-clarification' | 'reject'

const DECISION_TO_REVIEW: Record<Decision, ReviewDecision> = {
    approve: 'APPROVE',
    'needs-clarification': 'NEEDS-CLARIFICATION',
    reject: 'REJECT',
}

export function toReviewDecision(decision: Decision): ReviewDecision {
    return DECISION_TO_REVIEW[decision]
}

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
