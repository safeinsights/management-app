import { getStudyAction } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderResearcherCodeStep } from '../../_screens/render-screen'

// Read-only post-decision code step, reached by walking back from the results screen.
// renderResearcherCodeStep 404s if the study hasn't reached the code stage.
export default async function StudyViewCode(props: {
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

    return renderResearcherCodeStep({
        raw: rawStudyState,
        study,
        orgSlug,
        dashboardHref,
        returnTo,
    })
}
