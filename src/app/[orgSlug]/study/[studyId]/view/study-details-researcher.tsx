import { StudyPageHeader } from '@/components/study/study-page-header'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import type { StepNav } from '@/lib/study-screen'

type StudyDetailsResearcherProps = {
    study: SelectedStudy
    job: LatestJobForStudy
    nav: StepNav
}

export function StudyDetailsResearcher({ study, job, nav }: StudyDetailsResearcherProps) {
    return (
        <StudyDetailsResearcherView
            header={<StudyPageHeader study={study} />}
            nav={nav}
            statusMessage={<JobResultsStatusMessage job={job} files={job.files} />}
        />
    )
}
