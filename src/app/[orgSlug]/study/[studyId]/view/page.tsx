import { getStudyAction } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../_screens/render-screen'

export default async function StudyView(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<Record<string, string | undefined>>
}) {
    const { studyId, orgSlug } = await props.params
    const searchParams = await props.searchParams

    const study = actionResult(await getStudyAction({ studyId }))
    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) notFound()

    const returnTo = searchParams.returnTo === 'org' ? 'org' : undefined
    const dashboardHref = returnTo ? Routes.orgDashboard({ orgSlug }) : Routes.dashboard

    return renderStudyScreen({
        role: 'researcher',
        raw: rawStudyState,
        study,
        orgSlug,
        studyId,
        dashboardHref,
        returnTo,
    })
}
