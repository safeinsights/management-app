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

// Canonical mapping: every ReviewDecision has exactly one StudyStatus counterpart.
const REVIEW_DECISION_TO_STATUS: Record<ReviewDecision, StudyStatus> = {
    APPROVE: 'APPROVED',
    REJECT: 'REJECTED',
    'NEEDS-CLARIFICATION': 'CHANGE-REQUESTED',
}

// A decided proposal doesn't always carry a studyProposalComment row: the approve/reject paths
// (performStudyProposalApproval) record the decision on the study itself without writing feedback.
// Mapping the study status lets the feedback view synthesize a decision so it renders the decided
// proposal instead of a blank PostFeedbackView (which returns null when no decision exists).
// Derived from REVIEW_DECISION_TO_STATUS to keep the two maps in sync.
export const PROPOSAL_STATUS_TO_REVIEW_DECISION = Object.fromEntries(
    Object.entries(REVIEW_DECISION_TO_STATUS).map(([k, v]) => [v, k]),
) as Partial<Record<StudyStatus, ReviewDecision>>

// Code submit/resubmit flips study.status back to PENDING-REVIEW, so status alone can't say
// whether the proposal was ever decided. approvedAt/rejectedAt survive those flips (approval and
// rejection clear each other), making them the durable record once the study is code-stage.
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

// Durable proposal status: maps the decision back to the StudyStatus the banner/nav/timestamp
// expect, falling through to raw status when no decision exists (genuinely pending or draft).
export function effectiveProposalStatus(study: {
    status: StudyStatus
    approvedAt: Date | null
    rejectedAt: Date | null
}): StudyStatus {
    const decision = proposalReviewDecision(study)
    return decision ? REVIEW_DECISION_TO_STATUS[decision] : study.status
}

// A code decision can be written (proposal approve/reject path) without a code-review comment, so
// the code feedback view synthesizes the decision from the job's CODE-* status when no comment rows
// exist — keeps the page on the code post-feedback view rather than blanking out.
export const CODE_DECISION_TO_REVIEW_DECISION: Record<CodeDecisionStatus, ReviewDecision> = {
    'CODE-APPROVED': 'APPROVE',
    'CODE-CHANGES-REQUESTED': 'NEEDS-CLARIFICATION',
    'CODE-REJECTED': 'REJECT',
}
