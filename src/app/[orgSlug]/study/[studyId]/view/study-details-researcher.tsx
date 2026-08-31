import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { StepNav } from '@/lib/study-screen'

// OTTER-538: Study Details page (RL) — drops the "Study Code" section.
// OTTER-673: the step nav, including where "Previous step" lands, is resolved upstream, not here.

type StudyDetailsResearcherProps = {
    job: LatestJobForStudy
    nav: StepNav
}

export function StudyDetailsResearcher({ job, nav }: StudyDetailsResearcherProps) {
    return (
        <StudyDetailsResearcherView nav={nav} statusMessage={<JobResultsStatusMessage job={job} files={job.files} />} />
    )
}
