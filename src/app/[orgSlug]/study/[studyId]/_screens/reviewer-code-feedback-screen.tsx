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

    // Only the read-only /review/code walk-back (descriptor.readOnlyCodeStep) shows "Previous" → it
    // continues back to the decided proposal (OTTER-643; one hop since OTTER-727 hid the intervening
    // agreements step). The live code-decision screen leaves it unset, matching the live DO design
    // that hides Previous.
    const previousHref = descriptor.readOnlyCodeStep
        ? Routes.studyReviewProposal({ orgSlug, studyId: study.id })
        : undefined

    // OTTER-687: forward to the DP outputs screen, which lives at bare /review. Suppressed while
    // /review still resolves to this screen (code approved, enclave not started yet), where the
    // button would only point back at the page it sits on.
    //
    // On the walk-back route the two resolvers deliberately disagree, and the forward link is the
    // point of that: resolveReviewerCodeScreen restricts its candidates to the code screens so a
    // results study lands here instead of looping to results, while hasNextStepFromCode asks the full
    // table and still answers "results". So a reviewer who walked back from results gets Previous and
    // Next step, with Next returning them to the screen they came from.
    const state = projectStudyState(raw)
    const nextStepHref = hasNextStepFromCode('reviewer', state, descriptor.screen)
        ? Routes.studyReview({ orgSlug, studyId: study.id })
        : undefined

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
                previousHref={previousHref}
                nextStepHref={nextStepHref}
            />
        )
    }
    // Source the live decision from the state machine (the same projection that routed us here:
    // reviewer-screen-rules' `codeDecision !== null`), not a hand-rolled status walk. This tracks
    // count-based liveness and decision priority, and looking the timestamp up by the resolved
    // decision keeps us on the current decision rather than the first one recorded on the job.
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
