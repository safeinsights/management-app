'use client'

import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { useState } from 'react'
import { StudyResults } from './study-results'
import { StudyReviewButtons } from './study-review-buttons'

export const StudyResultsWithReview = ({ job, study }: { job: LatestJobForStudy; study: SelectedStudy }) => {
    const [approvedFiles, setApprovedFiles] = useState<JobFileInfo[]>()

    return (
        <>
            <StudyResults job={job} onFilesApproved={setApprovedFiles} />
            <StudyReviewButtons study={study} approvedFiles={approvedFiles} />
        </>
    )
}
