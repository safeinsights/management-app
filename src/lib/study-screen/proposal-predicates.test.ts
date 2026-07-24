import { describe, expect, it } from 'vitest'
import {
    canDeleteProposalDraft,
    canEditProposalDraft,
    canResubmitProposal,
    canReviewerReviewProposal,
    canStartProposalRevision,
    isFreshProposalDraft,
    isProposalRevisionDraft,
    shouldReviewerSeeStudy,
    type ProposalStudyFacts,
} from './proposal-predicates'

const facts = (o: Partial<ProposalStudyFacts>): ProposalStudyFacts => ({
    status: 'DRAFT',
    proposalRevisionBaseSubmissionId: null,
    ...o,
})

const fresh = facts({ status: 'DRAFT', proposalRevisionBaseSubmissionId: null })
const revision = facts({ status: 'DRAFT', proposalRevisionBaseSubmissionId: 'sub-1' })
const changeRequested = facts({ status: 'CHANGE-REQUESTED' })
const underReview = facts({ status: 'PENDING-REVIEW' })
const approved = facts({ status: 'APPROVED' })

describe('proposal predicates', () => {
    it('distinguishes fresh vs revision draft by the base snapshot id, not status alone', () => {
        expect(isFreshProposalDraft(fresh)).toBe(true)
        expect(isProposalRevisionDraft(fresh)).toBe(false)
        expect(isFreshProposalDraft(revision)).toBe(false)
        expect(isProposalRevisionDraft(revision)).toBe(true)
    })

    it('only change-requested can start a revision', () => {
        expect(canStartProposalRevision(changeRequested)).toBe(true)
        expect(canStartProposalRevision(underReview)).toBe(false)
        expect(canStartProposalRevision(revision)).toBe(false)
    })

    it('both draft flavors are editable; non-drafts are not', () => {
        expect(canEditProposalDraft(fresh)).toBe(true)
        expect(canEditProposalDraft(revision)).toBe(true)
        expect(canEditProposalDraft(changeRequested)).toBe(false)
        expect(canEditProposalDraft(approved)).toBe(false)
    })

    it('resubmit is revision-only; delete is fresh-only', () => {
        expect(canResubmitProposal(revision)).toBe(true)
        expect(canResubmitProposal(fresh)).toBe(false)
        expect(canDeleteProposalDraft(fresh)).toBe(true)
        expect(canDeleteProposalDraft(revision)).toBe(false)
    })

    it('reviewer can act only under review', () => {
        expect(canReviewerReviewProposal(underReview)).toBe(true)
        expect(canReviewerReviewProposal(changeRequested)).toBe(false)
        expect(canReviewerReviewProposal(revision)).toBe(false)
    })

    it('reviewers see everything except a fresh draft', () => {
        expect(shouldReviewerSeeStudy(fresh)).toBe(false)
        expect(shouldReviewerSeeStudy(revision)).toBe(true)
        expect(shouldReviewerSeeStudy(changeRequested)).toBe(true)
        expect(shouldReviewerSeeStudy(underReview)).toBe(true)
        expect(shouldReviewerSeeStudy(approved)).toBe(true)
    })
})
