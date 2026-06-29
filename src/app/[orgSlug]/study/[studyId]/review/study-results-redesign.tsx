'use client'

import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { isEncryptedLogType } from '@/lib/file-type-helpers'
import { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
// Job-level Approve/Reject for results. Distinct from StudyReviewButtons which is the
// study-level (proposal-level) approve/reject used elsewhere.
import { JobReviewButtons } from './job-review-buttons'
import { JobStatusHelpText } from './study-results'

// OTTER-538: replacement for StudyResults — shows the new secondary text on RUN-COMPLETE,
// hides the results table and Approve/Reject until the reviewer's key successfully decrypts.
// For terminal statuses (FILES-APPROVED, FILES-REJECTED, JOB-ERRORED) we still defer to
// JobStatusHelpText so the user sees status-appropriate copy instead of a "successfully
// processed" message that would be misleading for an errored or rejected job.

const RUN_COMPLETE_SECONDARY_TEXT =
    'The code was successfully processed! Review results and security logs (if available) to decide if these can be released to the researcher.'

const StatusCopy: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const { isComplete, isApproved, isRejected, isErrored } = useJobStatus(job.statusChanges)
    const hasEncryptedLogs = job.files?.some((f) => isEncryptedLogType(f.fileType)) ?? false

    if (isApproved || isRejected || isErrored) {
        return <JobStatusHelpText job={job} hasEncryptedLogs={hasEncryptedLogs} />
    }
    if (isComplete) {
        return <Text>{RUN_COMPLETE_SECONDARY_TEXT}</Text>
    }
    return null
}

export const StudyResultsRedesign: FC<{
    job: LatestJobForStudy
    onFilesApproved?: (files: JobFileInfo[]) => void
}> = ({ job, onFilesApproved }) => {
    const [decryptedResults, setDecryptedResults] = useState<JobFileInfo[]>()

    const handleFilesApproved = (files: JobFileInfo[]) => {
        // EncryptedFilesPanel emits [] on mount before any decryption — ignore
        // that initial emission so JobReviewButtons stays hidden until decryption.
        setDecryptedResults((prev) => (prev === undefined && files.length === 0 ? prev : files))
        onFilesApproved?.(files)
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={4} size="xl">
                        Study Status
                    </Title>
                    <JobReviewButtons job={job} decryptedResults={decryptedResults} />
                </Group>
                <Divider c="dimmed" />
                <StatusCopy job={job} />
                <EncryptedFilesPanel
                    isReviewer
                    job={job}
                    onFilesApproved={handleFilesApproved}
                    hideTableUntilDecrypted
                />
            </Stack>
        </Paper>
    )
}
