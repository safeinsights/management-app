'use client'

import { FC } from 'react'
import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import { LegacyJobResults } from '@/components/legacy-job-results'
import { jobHasLegacyResults } from '@/lib/file-type-helpers'
import type { LatestJobForStudy } from '@/server/db/queries'

// Researcher-facing view of shared results. Newer jobs encrypt results for the researcher, so they
// flow through the reviewer's EncryptedFilesPanel (table + status icons + preview + download) and
// decrypt with the researcher's own key; onFilesApproved is a no-op since researchers don't approve.
// Jobs from before PR #764 have plaintext results and no key, so they render via LegacyJobResults.
const noop = () => {}

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    if (jobHasLegacyResults(job.files ?? [])) {
        return <LegacyJobResults job={job} />
    }
    return <EncryptedFilesPanel isReviewer={false} job={job} onFilesApproved={noop} />
}
