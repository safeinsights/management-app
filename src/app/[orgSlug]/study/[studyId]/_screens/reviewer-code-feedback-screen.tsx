import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { projectStudyState } from '@/lib/study-screen'
import { CODE_DECISION_TO_REVIEW_DECISION } from '@/lib/review-decision'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { codeRoundForJob } from '@/server/db/code-round'
import { jobAnalysisForJob, latestSubmittedJobForStudy } from '@/server/db/queries'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

export async function ReviewerCodeFeedbackScreen({ study, raw, orgSlug, nav }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const state = projectStudyState(raw)

    const job = await latestSubmittedJobForStudy(study.id)
    // The post-decision page shows the same full "Submitted code" section as active review, so it
    // needs the review and scan rows too (OTTER-613).
    const analysis = job ? await jobAnalysisForJob(job) : null
    const entries = await getCodeReviewFeedbackAction({ studyId: study.id })
    const safeEntries = isActionError(entries) ? [] : entries
    // The round of the code on this job, not codeSubmissionVersion: that counts the
    // CODE-CHANGES-REQUESTED just written and would label this page as the next iteration.
    const reviewVersion = job ? await codeRoundForJob(job.id) : 1
    if (safeEntries.length > 0) {
        return (
            <PostFeedbackView
                orgSlug={orgSlug}
                study={study}
                entries={safeEntries}
                kind="CODE"
                job={job}
                analysis={analysis}
                reviewVersion={reviewVersion}
                nav={nav}
            />
        )
    }
    // Sourced from the same projection that routed us here, so liveness and decision priority
    // cannot drift from the routing rules.
    const { codeDecision } = state
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
            analysis={analysis}
            fallback={fallback}
            reviewVersion={reviewVersion}
            nav={nav}
        />
    )
}
