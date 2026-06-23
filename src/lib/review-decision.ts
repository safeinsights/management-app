import type { ReviewDecision, StudyStatus } from '@/database/types'
import type { CodeDecisionStatus } from '@/lib/study-job-status'

// User-facing decision tokens used in both proposal- and code-review flows.
// Maps to the persisted `ReviewDecision` enum via `toReviewDecision`.
export type Decision = 'approve' | 'needs-clarification' | 'reject'

const DECISION_TO_REVIEW: Record<Decision, ReviewDecision> = {
    approve: 'APPROVE',
    'needs-clarification': 'NEEDS-CLARIFICATION',
    reject: 'REJECT',
}

export function toReviewDecision(decision: Decision): ReviewDecision {
    return DECISION_TO_REVIEW[decision]
}

// A decided proposal doesn't always carry a studyProposalComment row: the approve/reject paths
// (performStudyProposalApproval) record the decision on the study itself without writing feedback.
// Mapping the study status lets the feedback view synthesize a decision so it renders the decided
// proposal instead of a blank PostFeedbackView (which returns null when no decision exists).
export const PROPOSAL_STATUS_TO_REVIEW_DECISION: Partial<Record<StudyStatus, ReviewDecision>> = {
    APPROVED: 'APPROVE',
    REJECTED: 'REJECT',
    'CHANGE-REQUESTED': 'NEEDS-CLARIFICATION',
}

// A code decision can be written (proposal approve/reject path) without a code-review comment, so
// the code feedback view synthesizes the decision from the job's CODE-* status when no comment rows
// exist — keeps the page on the code post-feedback view rather than blanking out.
export const CODE_DECISION_TO_REVIEW_DECISION: Record<CodeDecisionStatus, ReviewDecision> = {
    'CODE-APPROVED': 'APPROVE',
    'CODE-CHANGES-REQUESTED': 'NEEDS-CLARIFICATION',
    'CODE-REJECTED': 'REJECT',
}
