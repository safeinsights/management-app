'use client'

import { FC } from 'react'
import type { LatestJobForStudy } from '@/server/db/queries'
import { type FileType } from '@/database/types'
import { JobResults } from '@/components/job-results'
import { JobResultsStatusMessageView } from './job-results-status-message-view'

// Data container: fetches the approved-results listing (JobResults' useQuery + server action)
// and injects it into the presentational JobResultsStatusMessageView via the `results` slot.
export type JobResultsStatusMessageProps = {
    job: LatestJobForStudy
    files: { fileType: FileType }[]
    submittingOrgSlug: string
}

export const JobResultsStatusMessage: FC<JobResultsStatusMessageProps> = ({ job, files, submittingOrgSlug }) => {
    return (
        <JobResultsStatusMessageView
            statusChanges={job.statusChanges}
            files={files}
            jobId={job.id}
            studyId={job.studyId}
            submittingOrgSlug={submittingOrgSlug}
            results={<JobResults job={job} />}
        />
    )
}
