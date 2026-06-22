import type { Route } from 'next'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (RL) — removes the "Study Code" section.
// returnTo is accepted (for legacy cascade compatibility) but no longer used to build a
// previousHref — results is terminal (OTTER-612 back-nav removed). dashboardHref already
// reflects returnTo (baked in by the page/screen wrapper before rendering).

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
    returnTo?: 'org'
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref }: StudyDetailsResearcherProps) {
    return (
        <StudyDetailsResearcherView
            studyId={study.id}
            orgSlug={orgSlug}
            dashboardHref={dashboardHref}
            statusMessage={<JobResultsStatusMessage job={job} files={job.files} submittingOrgSlug={orgSlug} />}
        />
    )
}
