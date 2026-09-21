import type { ReviewDecision, StudyStatus } from '@/database/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

export type Decision = 'approve' | 'needs-clarification' | 'reject'

const DECISION_TO_REVIEW: Record<Decision, ReviewDecision> = {
    approve: 'APPROVE',
    'needs-clarification': 'NEEDS-CLARIFICATION',
    reject: 'REJECT',
}

export function toReviewDecision(decision: Decision): ReviewDecision {
    return DECISION_TO_REVIEW[decision]
}

const REVIEW_DECISION_TO_STATUS: Record<ReviewDecision, StudyStatus> = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    'NEEDS-CLARIFICATION': 'CHANGE-REQUESTED',
}

// A decided proposal doesn't always carry a studyProposalComment row, so the feedback view
// synthesizes the decision from the status rather than rendering blank.
export const PROPOSAL_STATUS_TO_REVIEW_DECISION = Object.fromEntries(
    Object.entries(REVIEW_DECISION_TO_STATUS).map(([k, v]) => [v, k]),
) as Partial<Record<StudyStatus, ReviewDecision>>

// The approvedAt/rejectedAt fallback covers rows written by old pods during a rolling deploy,
// which flipped status back to PENDING-REVIEW on code resubmit.
export function proposalReviewDecision(study: {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
}): ReviewDecision | undefined {
    const byStatus = PROPOSAL_STATUS_TO_REVIEW_DECISION[study.status]
    if (byStatus) return byStatus
    if (study.approvedAt) return 'APPROVE'
    if (study.rejectedAt) return 'REJECT'
    return undefined
}

export function effectiveProposalStatus(study: {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
}): StudyStatus {
    const decision = proposalReviewDecision(study)
    return decision ? REVIEW_DECISION_TO_STATUS[decision] : study.status
}

// A code decision can be written without a code-review comment, so the feedback view synthesizes
// it from the job's CODE-* status rather than blanking out.
export const CODE_DECISION_TO_REVIEW_DECISION: Record<CodeDecisionStatus, ReviewDecision> = {
    'CODE-APPROVED': 'APPROVE',
    'CODE-CHANGES-REQUESTED': 'NEEDS-CLARIFICATION',
    'CODE-REJECTED': 'REJECT',
}
