import type { ReviewDecision } from '@/database/types'

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
