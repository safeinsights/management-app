import { notFound } from 'next/navigation'
import { codeDecisionForScreen, projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { latestSubmittedJobForStudy, getOrgNameFromId } from '@/server/db/queries'
import { isSubmittedStudy } from '@/schema/study'
import { CodePostDecisionView } from '../view/code-post-decision-view'
import { loadCodeReviewFeedback } from '../view/load-code-review-feedback'
import type { ScreenComponentProps } from './types'

// code-approved and code-feedback both render this view; codeDecisionForScreen reads back which one
// the rule table picked, so the banner and the nav cannot disagree with the page that routed.
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

    const nav = resolveStepNav(decision.screen, state, {
        orgSlug,
        studyId: study.id,
        dashboardHref,
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
