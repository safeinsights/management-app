import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { projectStudyState, hasNextStepFromCode } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, getOrgNameFromId } from '@/server/db/queries'
import { isSubmittedStudy } from '@/schema/study'
import { CodePostDecisionView } from '../view/code-post-decision-view'
import { loadReviewFeedback } from '../view/load-review-feedback'
import type { ScreenComponentProps } from './types'

// code-approved AND code-feedback both render the post-decision view. The effective decision is
// APPROVED while the code is approved or executing; otherwise it's the live
// CHANGES-REQUESTED/REJECTED decision.
export async function CodeDecisionScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
    descriptor,
}: ScreenComponentProps) {
    const state = projectStudyState(raw)
    const decisionStatus =
        state.codeDecision === 'CODE-APPROVED' || state.isExecuting ? 'CODE-APPROVED' : state.codeDecision
    if (decisionStatus === null) notFound()

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()
    if (!isSubmittedStudy(study)) notFound()
    const { entries, feedbackLoadError } = await loadReviewFeedback(study.id, 'CODE')
    const reviewingOrgName = await getOrgNameFromId(study.orgId)

    // OTTER-614 / OTTER-687: the code page forwards to plain /view instead of ending at the
    // dashboard, but only when /view resolves past this screen. Otherwise the button would point at
    // the page it sits on.
    const nextStepHref = hasNextStepFromCode('researcher', state, descriptor.screen)
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
            nextStepHref={nextStepHref}
            feedbackLoadError={feedbackLoadError}
        />
    )
}
