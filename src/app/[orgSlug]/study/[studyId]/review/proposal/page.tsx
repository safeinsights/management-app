'use server'

import type { Metadata } from 'next'
import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { proposalReviewDecision } from '@/lib/review-decision'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderScreenById, renderStudyScreen } from '../../_screens/render-screen'
import { reviewerPageGuard } from '../reviewer-page-guard'

export async function generateMetadata(): Promise<Metadata> {
    return { title: 'Review proposal' }
}

// Shows the decided proposal even when the canonical /review screen is code-stage. Decided-ness
// comes from proposalReviewDecision because code submissions flip status back to PENDING-REVIEW.
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
            dashboardHref: Routes.dashboard,
        })
    }

    return renderScreenById(
        { screen: 'reviewer-proposal-feedback' },
        { role: 'reviewer', study, raw, orgSlug, dashboardHref: Routes.dashboard },
    )
}
