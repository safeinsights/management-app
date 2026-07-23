'use server'

import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderReviewerCodeStep } from '../../_screens/render-screen'
import { reviewerPageGuard } from '../reviewer-page-guard'

// Read-only post-decision code step for the reviewer (DO), reached by walking back from the results
// screen. renderReviewerCodeStep 404s if the study hasn't reached the code stage. Uses the shared
// reviewerPageGuard so a non-reviewer is handled exactly as on /review and /review/proposal.
export default async function StudyReviewCodePage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params

    const guard = await reviewerPageGuard(orgSlug, studyId)
    if (!guard.ok) return guard.render
    const { study } = guard

    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) return <AlertNotFound title="Study was not found" message="No such study exists" />

    return renderReviewerCodeStep({
        raw,
        study,
        orgSlug,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })
}
