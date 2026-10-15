import type { Metadata } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../_screens/render-screen'
import { researcherPageGuard } from '../researcher-page-guard'

export const metadata: Metadata = { title: 'Study details' }

export default async function StudyView(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const study = actionResult(await getStudyAction({ studyId }))
    const guard = await researcherPageGuard(study, studyId)
    if (!guard.ok) return guard.render

    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) notFound()

    return renderStudyScreen({
        role: 'researcher',
        raw: rawStudyState,
        study,
        orgSlug,
    })
}
