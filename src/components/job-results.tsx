'use client'

import { FC } from 'react'
import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import type { LatestJobForStudy } from '@/server/db/queries'

// Researcher-facing view of shared results. Reuses the reviewer's EncryptedFilesPanel (table +
// status icons + modal preview + download) so both sides match. Researchers don't approve, so
// onFilesApproved is a no-op; they decrypt the bodies with their own key.
const noop = () => {}

export const JobResults: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    return <EncryptedFilesPanel isReviewer={false} job={job} onFilesApproved={noop} />
}
