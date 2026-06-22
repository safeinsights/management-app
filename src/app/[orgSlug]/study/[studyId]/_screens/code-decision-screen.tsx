import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { projectStudyState } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, getOrgNameFromId } from '@/server/db/queries'
import { isSubmittedStudy } from '@/schema/study'
import { CodePostDecisionView } from '../view/code-post-decision-view'
import { loadCodeReviewFeedback } from '../view/load-code-review-feedback'
import type { ScreenComponentProps } from './types'

// code-approved AND code-feedback both render the post-decision view. The effective decision is
// APPROVED while the code is approved or executing (OTTER-598: hide the code listing while
// executing); otherwise it's the live CHANGES-REQUESTED/REJECTED decision.
export async function CodeDecisionScreen({ study, raw, orgSlug, dashboardHref }: ScreenComponentProps) {
    const state = projectStudyState(raw)
    const decisionStatus =
        state.codeDecision === 'CODE-APPROVED' || state.isExecuting ? 'CODE-APPROVED' : state.codeDecision
    if (decisionStatus === null) notFound()

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()
    if (!isSubmittedStudy(study)) notFound()
    const { entries, feedbackLoadError } = await loadCodeReviewFeedback(study.id)
    const reviewingOrgName = await getOrgNameFromId(study.orgId)

    return (
        <CodePostDecisionView
            orgSlug={orgSlug}
            study={study}
            job={job}
            entries={entries}
            reviewingOrgName={reviewingOrgName}
            dashboardHref={dashboardHref as Route}
            latestJobStatus={decisionStatus}
            feedbackLoadError={feedbackLoadError}
            showStudyCode={!state.isExecuting}
        />
    )
}
