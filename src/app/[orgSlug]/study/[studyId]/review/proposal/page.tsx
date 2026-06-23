'use server'

import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { ReviewerProposalFeedbackScreen } from '../../_screens/reviewer-proposal-feedback-screen'
import { reviewerPageGuard } from '../reviewer-page-guard'

export default async function ReviewProposalPage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params

    const guard = await reviewerPageGuard(orgSlug, studyId)
    if (!guard.ok) return guard.render
    const { study } = guard

    // The screen ignores `raw`, but `ScreenComponentProps` requires it; fetch it only here to satisfy the type.
    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) return <AlertNotFound title="Study was not found" message="No such study exists" />

    return (await ReviewerProposalFeedbackScreen({
        descriptor: { screen: 'reviewer-proposal-feedback' },
        study,
        raw,
        orgSlug,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })) as React.JSX.Element
}
