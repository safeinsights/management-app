import type { Metadata } from 'next'
import { getStudyAction } from '@/server/actions/study.actions'
import { rawStudyStateForStudy } from '@/server/db/study-state-query'
import { isActionError } from '@/lib/errors'
import { StudyNavSearchParams } from '@/lib/routes'
import { AlertNotFound } from '@/components/errors'
import { isSubmittedStudy } from '@/schema/study'
import { renderScreenById } from '../_screens/render-screen'
import { researcherPageGuard } from '../researcher-page-guard'

export const metadata: Metadata = { title: 'Submit proposal' }

// The proposal-status page whatever the study has done since: it is the anchor every code-phase
// "Previous step" walks back to, so the screen is pinned rather than resolved (resolveScreen would
// forward-jump to a code screen for the same state).
export default async function StudySubmittedRoute(props: {
    params: Promise<{ studyId: string; orgSlug: string }>
    searchParams: Promise<{ from?: string }>
}) {
    const { studyId, orgSlug } = await props.params
    const { from } = StudyNavSearchParams.parse(await props.searchParams)

    const result = await getStudyAction({ studyId })

    if (isActionError(result) || !result) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    const guard = await researcherPageGuard(result, studyId)
    if (!guard.ok) return guard.render

    if (!isSubmittedStudy(result)) {
        return <AlertNotFound title="Study was not found" message="This study has not been submitted yet" />
    }

    const raw = await rawStudyStateForStudy(studyId)
    if (!raw) {
        return <AlertNotFound title="Study was not found" message="No such study exists" />
    }

    return renderScreenById({ screen: 'proposal-feedback' }, { role: 'researcher', raw, study: result, orgSlug, from })
}
