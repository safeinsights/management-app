import type { Metadata } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { actionResult } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { renderStudyScreen } from '../_screens/render-screen'

export const metadata: Metadata = { title: 'Study details' }

export default async function StudyView(props: { params: Promise<{ studyId: string; orgSlug: string }> }) {
    const { studyId, orgSlug } = await props.params

    const study = actionResult(await getStudyAction({ studyId }))
    const rawStudyState = await rawStudyStateForStudy(studyId)
    if (!rawStudyState) notFound()

    return renderStudyScreen({
        role: 'researcher',
        raw: rawStudyState,
        study,
        orgSlug,
    })
}
