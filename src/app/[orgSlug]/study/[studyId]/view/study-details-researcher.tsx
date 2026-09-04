import { Routes } from '@/lib/routes'
import { StudyPageHeader } from '@/components/study/study-page-header'
import { JobResultsStatusMessage } from './job-results-status-message'
import { StudyDetailsResearcherView } from './study-details-researcher-view'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'

// OTTER-614: returnTo is threaded so org scope survives the hop back to the code screen.

type StudyDetailsResearcherProps = {
    orgSlug: string
    study: SelectedStudy
    job: LatestJobForStudy
    returnTo?: 'org'
}

export function StudyDetailsResearcher({ orgSlug, study, job, returnTo }: StudyDetailsResearcherProps) {
    const previousHref = Routes.studyViewCode({ orgSlug, studyId: study.id, returnTo })
    return (
        <StudyDetailsResearcherView
            header={<StudyPageHeader study={study} />}
            previousHref={previousHref}
            statusMessage={<JobResultsStatusMessage job={job} files={job.files} submittingOrgSlug={orgSlug} />}
        />
    )
}
