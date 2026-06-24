'use server'

import { AlertNotFound } from '@/components/errors'
import { Routes } from '@/lib/routes'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../_screens/render-screen'
import { reviewerPageGuard } from './reviewer-page-guard'

export default async function StudyReviewPage(props: { params: Promise<{ orgSlug: string; studyId: string }> }) {
    const { orgSlug, studyId } = await props.params

    const guard = await reviewerPageGuard(orgSlug, studyId)
    if (!guard.ok) return guard.render
    const { study } = guard

    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) return <AlertNotFound title="Study was not found" message="No such study exists" />

    return renderStudyScreen({
        role: 'reviewer',
        raw,
        study,
        orgSlug,
        studyId,
        dashboardHref: Routes.orgDashboard({ orgSlug }),
    })
}
