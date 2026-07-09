import { describe, expect, it } from 'vitest'
import type { StudyStatus } from '@/database/types'
import { proposalReviewDecision } from './review-decision'

const study = (status: StudyStatus, overrides: { approvedAt?: Date | null; rejectedAt?: Date | null } = {}) => ({
    status,
    approvedAt: overrides.approvedAt ?? null,
    rejectedAt: overrides.rejectedAt ?? null,
})

describe('proposalReviewDecision', () => {
    it('maps decided statuses directly', () => {
        expect(proposalReviewDecision(study('APPROVED'))).toBe('APPROVE')
        expect(proposalReviewDecision(study('REJECTED'))).toBe('REJECT')
        expect(proposalReviewDecision(study('CHANGE-REQUESTED'))).toBe('NEEDS-CLARIFICATION')
    })

    it('falls back to approvedAt when code submission reset the status', () => {
        expect(proposalReviewDecision(study('PENDING-REVIEW', { approvedAt: new Date() }))).toBe('APPROVE')
    })

    it('falls back to rejectedAt when the status no longer carries the decision', () => {
        expect(proposalReviewDecision(study('PENDING-REVIEW', { rejectedAt: new Date() }))).toBe('REJECT')
    })

    it('prefers the explicit status over stale timestamps', () => {
        expect(proposalReviewDecision(study('CHANGE-REQUESTED', { approvedAt: new Date() }))).toBe(
            'NEEDS-CLARIFICATION',
        )
    })

    it('returns undefined for a proposal that was never decided', () => {
        expect(proposalReviewDecision(study('PENDING-REVIEW'))).toBeUndefined()
        expect(proposalReviewDecision(study('DRAFT'))).toBeUndefined()
    })
})
