import type { Metadata } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderResearcherCodeStep } from '../../_screens/render-screen'
import { researcherPageGuard } from '../../researcher-page-guard'
import { currentDb } from '@/server/request-context'

export const metadata: Metadata = { title: 'Study code' }

// renderResearcherCodeStep 404s if the study has not reached the code stage.
export default async function StudyViewCode(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const study = actionResult(await getStudyAction({ studyId }))
    const guard = await researcherPageGuard(study, studyId)
    if (!guard.ok) return guard.render

    const rawStudyState = await rawStudyStateForStudy(studyId, currentDb())
    if (!rawStudyState) notFound()

    return renderResearcherCodeStep({
        raw: rawStudyState,
        study,
        orgSlug,
    })
}
