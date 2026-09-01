import { notFound } from 'next/navigation'
import type { Route } from 'next'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'

// returnTo is threaded so org scope survives the hop back to the code step.
export async function StudyResultsScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    const nav = resolveStepNav('study-results', projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref: dashboardHref as Route,
        returnTo,
    })

    return <StudyDetailsResearcher job={job} nav={nav} />
}
