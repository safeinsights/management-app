import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (RL) — removes the "Study Code" section.
// OTTER-614: results is no longer terminal — "Previous" walks the read-only wizard back to the
// approved-code screen (/view?step=code). dashboardHref already reflects returnTo (baked in by the
// page/screen wrapper before rendering); returnTo is threaded onto the back link to keep org scope.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
    returnTo?: 'org'
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref, returnTo }: StudyDetailsResearcherProps) {
    const previousHref = Routes.studyView({ orgSlug, studyId: study.id, returnTo, step: 'code' }) as Route
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
