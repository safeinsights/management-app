import type { Route } from 'next'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { StepNav } from '@/lib/study-screen'

// OTTER-538: Study Details page (RL) — drops the "Study Code" section.
// OTTER-673: the step nav (including where "Previous step" lands) is resolved upstream, not here.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
    nav: StepNav
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref, nav }: StudyDetailsResearcherProps) {
    return (
        <StudyDetailsResearcherView
            studyId={study.id}
            orgSlug={orgSlug}
            nav={nav}
            dashboardHref={dashboardHref}
            statusMessage={<JobResultsStatusMessage job={job} files={job.files} />}
        />
    )
}
