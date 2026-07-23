'use server'

import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { proposalReviewDecision } from '@/lib/review-decision'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../../_screens/render-screen'
import { ReviewerProposalFeedbackScreen } from '../../_screens/reviewer-proposal-feedback-screen'
import { reviewerPageGuard } from '../reviewer-page-guard'

// The "View approved initial request" link opens this route in a new tab to always show the DECIDED
// proposal, even when the study's canonical /review screen is code-stage. Decided-ness comes from
// proposalReviewDecision, not raw status — code submissions flip status back to PENDING-REVIEW.
// A truly undecided proposal has nothing for the read-only feedback view to render, so it falls
// through to the canonical /review screen (editable proposal review) instead of a blank page.
export default async function ReviewProposalPage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params

    const guard = await reviewerPageGuard(orgSlug, studyId)
    if (!guard.ok) return guard.render
    const { study } = guard

    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) return <AlertNotFound title="Study was not found" message="No such study exists" />

    if (!proposalReviewDecision(study)) {
        return renderStudyScreen({
            role: 'reviewer',
            raw,
            study,
            orgSlug,
            studyId,
            dashboardHref: Routes.orgDashboard({ orgSlug }),
        })
    }

    // The screen ignores `raw`, but `ScreenComponentProps` requires it; pass the bundle we already have.
    return (await ReviewerProposalFeedbackScreen({
        descriptor: { screen: 'reviewer-proposal-feedback' },
        study,
        raw,
        orgSlug,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })) as React.JSX.Element
}
