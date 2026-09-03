import { isSubmittedStudy } from '@/schema/study'
import { isActionError } from '@/lib/errors'
import { AlertNotFound } from '@/components/errors'
import { hasNextStepFromCode, projectStudyState } from '@/lib/study-screen'
import { Routes } from '@/lib/routes'
import { CODE_DECISION_TO_REVIEW_DECISION } from '@/lib/review-decision'
import { getCodeReviewFeedbackAction } from '@/server/actions/study.actions'
import { getStudyReviewForJob, jobScanResultForJob, latestSubmittedJobForStudy } from '@/server/db/queries'
import { PostFeedbackView } from '../review/post-feedback-view'
import type { ScreenComponentProps } from './types'

export async function ReviewerCodeFeedbackScreen({ study, raw, orgSlug, descriptor }: ScreenComponentProps) {
    if (!isSubmittedStudy(study)) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    // Only the read-only walk-back shows "Previous", back to the decided proposal (OTTER-643).
    const previousHref = descriptor.readOnlyCodeStep
        ? Routes.studyReviewProposal({ orgSlug, studyId: study.id })
        : undefined

    // OTTER-687: the two resolvers deliberately disagree — resolveReviewerCodeScreen restricts
    // candidates to the code screens, while hasNextStepFromCode asks the full table.
    const state = projectStudyState(raw)
    const nextStepHref = hasNextStepFromCode('reviewer', state, descriptor.screen)
        ? Routes.studyReview({ orgSlug, studyId: study.id })
        : undefined

    const job = await latestSubmittedJobForStudy(study.id)
    // The post-decision page shows the same full "Submitted code" section as active review, so it
    // needs the review and scan rows too (OTTER-613).
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
                previousHref={previousHref}
                nextStepHref={nextStepHref}
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
            review={review}
            scan={scan}
            fallback={fallback}
            previousHref={previousHref}
            nextStepHref={nextStepHref}
        />
    )
}
