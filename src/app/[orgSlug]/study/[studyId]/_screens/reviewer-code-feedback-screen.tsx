import type { ReviewDecision } from '@/database/types'
import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { isCodeDecisionStatus, type CodeDecisionStatus } from '@/lib/study-job-status'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

// Code decided, read-only. A decision can be written (proposal approve/reject path) without a
// code-review comment, so synthesize the decision from the job's CODE-* status when no comment rows
// exist — keeps the page on the code post-feedback view rather than blanking out.
const CODE_DECISION_TO_REVIEW_DECISION: Record<CodeDecisionStatus, ReviewDecision> = {
    'CODE-APPROVED': 'APPROVE',
    'CODE-CHANGES-REQUESTED': 'NEEDS-CLARIFICATION',
    'CODE-REJECTED': 'REJECT',
}

export async function ReviewerCodeFeedbackScreen({ study, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const job = await latestSubmittedJobForStudy(study.id)
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    if (safeEntries.length > 0) {
        return <PostFeedbackView orgSlug={orgSlug} study={study} entries={safeEntries} kind="CODE" job={job} />
    }
    const fallbackStatus = job?.statusChanges.find((s) => isCodeDecisionStatus(s.status))
    const fallback =
        fallbackStatus && isCodeDecisionStatus(fallbackStatus.status)
            ? {
                  decision: CODE_DECISION_TO_REVIEW_DECISION[fallbackStatus.status],
                  timestamp: fallbackStatus.createdAt,
              }
            : undefined
    return <PostFeedbackView orgSlug={orgSlug} study={study} entries={[]} kind="CODE" job={job} fallback={fallback} />
}
