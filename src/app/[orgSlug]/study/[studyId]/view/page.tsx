import type React from 'react'
import { getStudyAction } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { projectStudyState, resolveScreen } from '@/lib/study-screen'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { SCREEN_COMPONENTS } from '../_screens/registry'

export default async function StudyReviewPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    // resolveScreen is the single authority on which screen a study shows. Every researcher /view
    // state maps to a registered screen component; the page just fetches, resolves, and renders.
    const study = actionResult(await getStudyAction({ studyId }))
    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) notFound()

    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined
    const dashboardHref = returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    const descriptor = resolveScreen('researcher', projectStudyState(rawStudyState), undefined, {
        orgSlug,
        studyId,
        returnTo,
    })
    const Screen = SCREEN_COMPONENTS[descriptor.screen]

    // Screens are awaited (not JSX children) so async server components resolve in the test harness.
    return (await Screen({
        descriptor,
        study,
        raw: rawStudyState,
        orgSlug,
        dashboardHref: dashboardHref as string,
        returnTo,
    })) as React.JSX.Element
}
