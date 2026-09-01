import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { projectStudyState, hasNextStepFromCode } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, getOrgNameFromId } from '@/server/db/queries'
import { isSubmittedStudy } from '@/schema/study'
import { CodePostDecisionView } from '../view/code-post-decision-view'
import { loadCodeReviewFeedback } from '../view/load-code-review-feedback'
import type { ScreenComponentProps } from './types'

// The effective decision is APPROVED while the code is approved or executing; otherwise it is the
// live CHANGES-REQUESTED/REJECTED decision.
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
    const { entries, feedbackLoadError } = await loadCodeReviewFeedback(study.id)
    const reviewingOrgName = await getOrgNameFromId(study.orgId)

    // Only when /view resolves past this screen; otherwise the button would point at the page it
    // sits on (OTTER-614, OTTER-687).
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
