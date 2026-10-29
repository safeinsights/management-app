import type { Metadata } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../_screens/render-screen'
import { researcherPageGuard } from '../researcher-page-guard'
import { currentDb } from '@/server/request-context'

export const metadata: Metadata = { title: 'Study details' }

export default async function StudyView(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const guard = await researcherPageGuard(await getStudyAction({ studyId }), studyId)
    if (!guard.ok) return guard.render
    const { study } = guard

    const rawStudyState = await rawStudyStateForStudy(studyId, currentDb())
    if (!rawStudyState) notFound()

    return renderStudyScreen({
        role: 'researcher',
        raw: rawStudyState,
        study,
        orgSlug,
    })
}
