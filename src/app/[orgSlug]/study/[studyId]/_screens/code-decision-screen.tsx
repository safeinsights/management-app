import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { codeDecisionForScreen, projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, getOrgNameFromId } from '@/server/db/queries'
import { isSubmittedStudy } from '@/schema/study'
import { CodePostDecisionView } from '../view/code-post-decision-view'
import { loadCodeReviewFeedback } from '../view/load-code-review-feedback'
import type { ScreenComponentProps } from './types'

// code-approved AND code-feedback both render the post-decision view. Which of the two resolved, and
// the decision it displays, are read back off the screen the rule table picked (codeDecisionForScreen)
// rather than re-derived here, so the banner and the nav cannot disagree with the page that routed.
export async function CodeDecisionScreen({
    study,
    raw,
    orgSlug,
    dashboardHref,
    returnTo,
    descriptor,
}: ScreenComponentProps) {
    const state = projectStudyState(raw)
    const decision = codeDecisionForScreen(descriptor.screen, state)
    if (!decision) notFound()

    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()
    if (!isSubmittedStudy(study)) notFound()
    const { entries, feedbackLoadError } = await loadCodeReviewFeedback(study.id)
    const reviewingOrgName = await getOrgNameFromId(study.orgId)

    // Whether a forward step exists is decided inside the nav table, which delegates to
    // hasNextStepFromCode (OTTER-687).
    const nav = resolveStepNav(decision.screen, state, {
        orgSlug,
        studyId: study.id,
        dashboardHref: dashboardHref as Route,
        returnTo,
    })

    return (
        <CodePostDecisionView
            orgSlug={orgSlug}
            study={study}
            job={job}
            entries={entries}
            reviewingOrgName={reviewingOrgName}
            returnTo={returnTo}
            latestJobStatus={decision.status}
            nav={nav}
            feedbackLoadError={feedbackLoadError}
        />
    )
}
