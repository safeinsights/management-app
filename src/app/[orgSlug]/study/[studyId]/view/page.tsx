import type React from 'react'
import { getStudyAction } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { projectStudyState, resolveScreen } from '@/lib/study-screen'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { SCREEN_COMPONENTS } from '../_screens/registry'
import { notFound } from 'next/navigation'

export default async function StudyReviewPage(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    // Load full study state and resolve the screen. resolveScreen is the single authority on which
    // screen a study shows; every researcher /view state maps to a registered screen component.
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
    // Registry is total for researcher screens; a missing entry is a programming error.
    if (!Screen) throw new Error(`No screen component registered for "${descriptor.screen}"`)

    // Screens are awaited (not rendered as JSX children) so async server components resolve in the
    // test harness. All screen components return elements.
    return (await Screen({
        descriptor,
        study,
        raw: rawStudyState,
        orgSlug,
        dashboardHref: dashboardHref as string,
    })) as React.JSX.Element
}
