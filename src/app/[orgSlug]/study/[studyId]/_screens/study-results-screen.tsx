import { notFound } from 'next/navigation'
import { latestSubmittedJobForStudy } from '@/server/db/queries'
import { projectStudyState, resolveStepNav } from '@/lib/study-screen'
import { StudyDetailsResearcher } from '../view/study-details-researcher'
import type { ScreenComponentProps } from './types'
import type { Route } from 'next'

// study-results: results page. "Previous step" walks back to the code step (/view/code) and "Edit code"
// is offered only when the study is actually resubmittable — both decided by resolveStepNav.
export async function StudyResultsScreen({ study, raw, orgSlug, dashboardHref, returnTo }: ScreenComponentProps) {
    const job = await latestSubmittedJobForStudy(study.id)
    if (!job) notFound()

    const nav = resolveStepNav('study-results', projectStudyState(raw), {
        orgSlug,
        studyId: study.id,
        dashboardHref: dashboardHref as Route,
        returnTo,
    })

    return (
        <StudyDetailsResearcher
            orgSlug={orgSlug}
            study={study}
            job={job}
            dashboardHref={dashboardHref as Route}
            nav={nav}
        />
    )
}
