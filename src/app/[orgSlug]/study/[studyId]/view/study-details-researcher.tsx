import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { StepNav } from '@/lib/study-screen'

type StudyDetailsResearcherProps = {
    job: LatestJobForStudy
    nav: StepNav
}

export function StudyDetailsResearcher({ job, nav }: StudyDetailsResearcherProps) {
    return (
        <StudyDetailsResearcherView nav={nav} statusMessage={<JobResultsStatusMessage job={job} files={job.files} />} />
    )
}
