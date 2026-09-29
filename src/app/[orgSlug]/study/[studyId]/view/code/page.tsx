import type { Metadata } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { Routes } from '@/lib/routes'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderResearcherCodeStep } from '../../_screens/render-screen'

export const metadata: Metadata = { title: 'Study code' }

// renderResearcherCodeStep 404s if the study has not reached the code stage.
export default async function StudyViewCode(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const study = actionResult(await getStudyAction({ studyId }))
    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) notFound()

    return renderResearcherCodeStep({
        raw: rawStudyState,
        study,
        orgSlug,
        dashboardHref: Routes.dashboard,
    })
}
