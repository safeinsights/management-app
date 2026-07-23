import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { projectStudyState, isErroredResultHiddenFromResearcher } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, getOrgNameFromId } from '@/server/db/queries'
import { isSubmittedStudy } from '@/schema/study'
import { CodePostDecisionView } from '../view/code-post-decision-view'
import { loadCodeReviewFeedback } from '../view/load-code-review-feedback'
import type { ScreenComponentProps } from './types'

// code-approved AND code-feedback both render the post-decision view. The effective decision is
// APPROVED while the code is approved or executing; otherwise it's the live
// CHANGES-REQUESTED/REJECTED decision.
export async function CodeDecisionScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const state = projectStudyState(raw)
    const decisionStatus =
        state.codeDecision === 'CODE-APPROVED' || state.isExecuting ? 'CODE-APPROVED' : state.codeDecision
    if (decisionStatus === null) notFound()

    const hiddenErroredResult = isErroredResultHiddenFromResearcher(state)

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()
    if (!isSubmittedStudy(study)) notFound()
    const { entries, feedbackLoadError } = await loadCodeReviewFeedback(study.id)
    const reviewingOrgName = await getOrgNameFromId(study.orgId)

    // OTTER-614: once results exist, the code page forwards to Step 5 (plain /view resolves to the
    // results screen) instead of ending at the dashboard.
    const resultsHref =
        state.hasResults && !hiddenErroredResult
            ? Routes.studyView({ orgSlug, studyId: study.id, returnTo })
            : undefined

    return (
        <CodePostDecisionView
            orgSlug={orgSlug}
            study={study}
            job={job}
            entries={entries}
            reviewingOrgName={reviewingOrgName}
            dashboardHref={dashboardHref as Route}
            returnTo={returnTo}
            latestJobStatus={decisionStatus}
            resultsHref={resultsHref}
            feedbackLoadError={feedbackLoadError}
        />
    )
}
