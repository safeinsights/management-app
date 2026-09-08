'use client'

import { FC } from 'react'
import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import { LegacyJobResults } from '@/components/legacy-job-results'
import { jobHasLegacyResults } from '@/lib/file-type-helpers'
import type { LatestJobForStudy } from '@/server/db/queries'

// Researchers never approve, so the panel's approval callback is inert here.
const noop = () => {}

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    if (jobHasLegacyResults(job.files ?? [])) {
        return <LegacyJobResults job={job} />
    }
    return <EncryptedFilesPanel isReviewer={false} job={job} onFilesApproved={noop} />
}
