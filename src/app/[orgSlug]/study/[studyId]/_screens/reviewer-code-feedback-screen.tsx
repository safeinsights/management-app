import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { projectStudyState } from '@/lib/study-screen'
import { CODE_DECISION_TO_REVIEW_DECISION } from '@/lib/review-decision'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { getStudyReviewForJob, jobScanResultForJob, latestSubmittedJobForStudy } from '@/server/db/queries'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

export async function ReviewerCodeFeedbackScreen({ study, raw, orgSlug }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }
    const job = await latestSubmittedJobForStudy(study.id)
    // The post-decision code page shows the full "Submitted code" section (datasets, AI summary,
    // security scan log, code viewer), the same section as active review, so it needs the review +
    // scan rows, not just the job (OTTER-613).
    const [review, scan] = job
        ? await Promise.all([getStudyReviewForJob(job.id), jobScanResultForJob(job.id)])
        : [null, null]
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    if (safeEntries.length > 0) {
        return (
            <PostFeedbackView
                orgSlug={orgSlug}
                study={study}
                entries={safeEntries}
                kind="CODE"
                job={job}
                review={review}
                scan={scan}
            />
        )
    }
    // Source the live decision from the state machine (the same projection that routed us here:
    // reviewer-screen-rules' `codeDecision !== null`), not a hand-rolled status walk. This tracks
    // count-based liveness and decision priority, and looking the timestamp up by the resolved
    // decision keeps us on the current decision rather than the first one recorded on the job.
    const { codeDecision } = projectStudyState(raw)
    const decisionTimestamp = codeDecision
        ? job?.statusChanges.find((s) => s.status === codeDecision)?.createdAt
        : undefined
    const fallback =
        codeDecision && decisionTimestamp
            ? { decision: CODE_DECISION_TO_REVIEW_DECISION[codeDecision], timestamp: decisionTimestamp }
            : undefined
    return (
        <PostFeedbackView
            orgSlug={orgSlug}
            study={study}
            entries={[]}
            kind="CODE"
            job={job}
            review={review}
            scan={scan}
            fallback={fallback}
        />
    )
}
