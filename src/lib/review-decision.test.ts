import { describe, expect, it } from 'vitest'
import type { StudyStatus } from '@/database/types'
import { effectiveProposalStatus, proposalReviewDecision, PROPOSAL_STATUS_TO_REVIEW_DECISION } from './review-decision'

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

describe('effectiveProposalStatus', () => {
    it('passes through decided statuses as-is', () => {
        expect(effectiveProposalStatus(study('APPROVED'))).toBe('APPROVED')
        expect(effectiveProposalStatus(study('REJECTED'))).toBe('REJECTED')
        expect(effectiveProposalStatus(study('CHANGE-REQUESTED'))).toBe('CHANGE-REQUESTED')
    })

    it('restores APPROVED when code submission reset status to PENDING-REVIEW', () => {
        expect(effectiveProposalStatus(study('PENDING-REVIEW', { approvedAt: new Date() }))).toBe('APPROVED')
    })

    it('restores REJECTED when status no longer carries the decision', () => {
        expect(effectiveProposalStatus(study('PENDING-REVIEW', { rejectedAt: new Date() }))).toBe('REJECTED')
    })

    it('returns raw status for undecided proposals', () => {
        expect(effectiveProposalStatus(study('PENDING-REVIEW'))).toBe('PENDING-REVIEW')
        expect(effectiveProposalStatus(study('DRAFT'))).toBe('DRAFT')
    })
})

describe('PROPOSAL_STATUS_TO_REVIEW_DECISION', () => {
    // The map is derived by inverting REVIEW_DECISION_TO_STATUS. A future decision colliding on
    // the same status would silently drop an entry. Guard the 1:1 assumption.
    it('inverts every decision without collisions', () => {
        expect(PROPOSAL_STATUS_TO_REVIEW_DECISION).toEqual({
            APPROVED: 'APPROVE',
            REJECTED: 'REJECT',
            'CHANGE-REQUESTED': 'NEEDS-CLARIFICATION',
        })
    })
})
