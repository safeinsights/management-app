'use client'

import type { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { useState } from 'react'
import { StudyResultsRedesign } from './study-results-redesign'
// Study-level (proposal-level) approve/reject. Distinct from JobReviewButtons (used
// inside StudyResultsRedesign), which approves/rejects the job's individual result files.
import { StudyReviewButtons } from './study-review-buttons'

// OTTER-538: pair of the redesigned StudyResults with the existing StudyReviewButtons
// so the proposal-level Approve/Reject keeps working on the redesigned page.
export const StudyResultsRedesignWithReview = ({
    job,
    study,
}: {
    job: NonNullable<LatestJobForStudy>
    study: SelectedStudy
}) => {
    const [approvedFiles, setApprovedFiles] = useState<JobFileInfo[]>()

    return (
        <>
            <StudyResultsRedesign job={job} onFilesApproved={setApprovedFiles} />
            <StudyReviewButtons study={study} approvedFiles={approvedFiles} />
        </>
    )
}
