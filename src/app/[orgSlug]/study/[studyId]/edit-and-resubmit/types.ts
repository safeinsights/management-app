import type {
    Json,
    ReviewDecision,
    StudyProposalCommentAuthorRole,
    StudyProposalCommentEntryType,
} from '@/database/types'

// Mirrors what OTTER-501's getProposalFeedbackForStudyAction returns. Defined
// locally so OTTER-521 doesn't depend on that action; once OTTER-501 lands,
// swap callers to import the action's exported type instead.
export interface ProposalFeedbackEntry {
    id: string
    authorId: string
    authorRole: StudyProposalCommentAuthorRole
    entryType: StudyProposalCommentEntryType
    decision: ReviewDecision | null
    body: Json
    createdAt: Date
    authorName: string
}
