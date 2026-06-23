import type { ReviewDecision, StudyStatus } from '@/database/types'
import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

// Decided proposal, read-only. Approve/reject can record the decision on the study without a
// feedback comment, so synthesize a decision from status to keep PostFeedbackView from blanking out.
const PROPOSAL_STATUS_TO_REVIEW_DECISION: Partial<Record<StudyStatus, ReviewDecision>> = {
    APPROVED: 'APPROVE',
    REJECTED: 'REJECT',
    'CHANGE-REQUESTED': 'NEEDS-CLARIFICATION',
}

export async function ReviewerProposalFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getProposalFeedbackForStudyAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    const decision = PROPOSAL_STATUS_TO_REVIEW_DECISION[study.status]
    const fallback = decision
        ? { decision, timestamp: study.approvedAt ?? study.rejectedAt ?? study.createdAt }
        : undefined
    return <PostFeedbackView orgSlug={orgSlug} study={study} entries={safeEntries} fallback={fallback} />
}
