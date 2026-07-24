import type { StudyStatus } from '@/database/types'

// OTTER-636: central proposal-lifecycle predicates. Routes, actions, dashboards, and editor gates must
// derive from these rather than re-implementing ad hoc status checks. The active-revision discriminator
// (proposalRevisionBaseSubmissionId) is the authoritative signal separating a fresh draft from a
// revision draft — do NOT infer that distinction from submittedAt.
export type ProposalStudyFacts = {
    status: StudyStatus
    proposalRevisionBaseSubmissionId: string | null
}

// Brand-new, never-submitted draft.
export const isFreshProposalDraft = (s: ProposalStudyFacts): boolean =>
    s.status === 'DRAFT' && s.proposalRevisionBaseSubmissionId == null

// A revision of a previously submitted proposal that the researcher has started editing; it literally
// uses status DRAFT but points at the immutable submitted snapshot it is revising.
export const isProposalRevisionDraft = (s: ProposalStudyFacts): boolean =>
    s.status === 'DRAFT' && s.proposalRevisionBaseSubmissionId != null

// A change-requested proposal may begin a revision on the first real edit.
export const canStartProposalRevision = (s: ProposalStudyFacts): boolean => s.status === 'CHANGE-REQUESTED'

// Either draft flavor is editable (fresh via /edit + /proposal, revision via /edit-and-resubmit).
export const canEditProposalDraft = (s: ProposalStudyFacts): boolean => s.status === 'DRAFT'

// Only a revision draft can be resubmitted; a fresh draft is finalized (first submission) instead.
export const canResubmitProposal = (s: ProposalStudyFacts): boolean => isProposalRevisionDraft(s)

// Only a fresh draft may be deleted; a revision draft has submitted history and must not be destroyed.
export const canDeleteProposalDraft = (s: ProposalStudyFacts): boolean => isFreshProposalDraft(s)

// Reviewers may take a proposal decision only while it is under review.
export const canReviewerReviewProposal = (s: ProposalStudyFacts): boolean => s.status === 'PENDING-REVIEW'

// Reviewers list every study except a fresh (never-submitted) draft. A revision draft IS listed (as
// Proposal Draft) but is not actionable.
export const shouldReviewerSeeStudy = (s: ProposalStudyFacts): boolean => !isFreshProposalDraft(s)
