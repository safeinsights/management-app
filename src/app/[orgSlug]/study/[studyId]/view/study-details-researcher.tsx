import { Routes } from '@/lib/routes'
import type { Route } from 'next'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-538: Study Details page (RL) — removes the "Study Code" section.
// "Previous" returns to the OTTER-537 post-code-submission page. That page only
// renders at /view while the job is in CODE-SUBMITTED/CODE-SCANNED status; once
// results exist it is otherwise unroutable, so we reach it via ?from=code-submission,
// which page.tsx routes to CodePostSubmissionView with the under-review banner hidden.
//
// Thin container: keeps the job/study data and injects the data-driven
// <JobResultsStatusMessage> into the presentational StudyDetailsResearcherView.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    dashboardHref?: Route
    returnTo?: 'org'
}

export function StudyDetailsResearcher({ orgSlug, study, job, dashboardHref, returnTo }: StudyDetailsResearcherProps) {
    const previousHref = Routes.studyView({ orgSlug, studyId: study.id, from: 'code-submission', returnTo })

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
