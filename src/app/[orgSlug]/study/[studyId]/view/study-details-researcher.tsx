import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (RL) — drops the "Study Code" section.
// OTTER-614: results is no longer terminal — "Previous" walks back to the code screen (/view/code);
// returnTo is threaded so org scope survives the hop.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
    returnTo?: 'org'
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref, returnTo }: StudyDetailsResearcherProps) {
    const previousHref = Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo })
    return (
        <StudyDetailsResearcherView
            studyId={study.id}
            orgSlug={orgSlug}
            previousHref={previousHref}
            dashboardHref={dashboardHref}
            statusMessage={<JobResultsStatusMessage job={job} files={job.files} submittingOrgSlug={orgSlug} />}
        />
    )
}
