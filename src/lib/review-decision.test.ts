import { describe, expect, it } from 'vitest'
import type { StudyStatus } from '@/database/types'
import { proposalReviewDecision, PROPOSAL_STATUS_TO_REVIEW_DECISION } from './review-decision'

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

    // Migration 1780300000000 moved the last legacy PENDING-REVIEW rows to APPROVED (OTTER-621, OTTER-973).
    it('reads the decision from the status alone, whatever the timestamps say', () => {
        expect(proposalReviewDecision(study('PENDING-REVIEW', { approvedAt: new Date() }))).toBeUndefined()
        expect(proposalReviewDecision(study('CHANGE-REQUESTED', { approvedAt: new Date() }))).toBe(
            'NEEDS-CLARIFICATION',
        )
    })

    it('returns undefined for a proposal that was never decided', () => {
        expect(proposalReviewDecision(study('PENDING-REVIEW'))).toBeUndefined()
        expect(proposalReviewDecision(study('DRAFT'))).toBeUndefined()
    })
})

describe('PROPOSAL_STATUS_TO_REVIEW_DECISION', () => {
    // Derived by inverting REVIEW_DECISION_TO_STATUS, so a collision would silently drop an entry.
    it('inverts every decision without collisions', () => {
        expect(PROPOSAL_STATUS_TO_REVIEW_DECISION).toEqual({
            APPROVED: 'APPROVE',
            REJECTED: 'REJECT',
            'CHANGE-REQUESTED': 'NEEDS-CLARIFICATION',
        })
    })
})
