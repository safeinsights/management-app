import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { proposalReviewDecision } from '@/lib/review-decision'
import { getProposalFeedbackForStudyAction } from '@/server/actions/study.actions'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

export async function ReviewerProposalFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const entries = await getProposalFeedbackForStudyAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    const decision = proposalReviewDecision(study)
    const fallback = decision
        ? { decision, timestamp: study.approvedAt ?? study.rejectedAt ?? study.createdAt }
        : undefined
    return <PostFeedbackView orgSlug={orgSlug} study={study} entries={safeEntries} fallback={fallback} />
}
