'use client'

import { CopyingInput } from '@/components/copying-input'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { isLogType } from '@/lib/file-type-helpers'
import { LatestJobForStudy } from '@/server/db/queries'
import { Group, Stack, Text } from '@mantine/core'
import { FC, ReactNode } from 'react'
import { ResubmitButton } from '@/components/study/resubmit-button'
import { JobResults } from '@/components/job-results'
import { type FileType } from '@/database/types'

export type JobResultsStatusMessageProps = {
    job: LatestJobForStudy
    files: { fileType: FileType }[]
    submittingOrgSlug: string
}

export const JobResultsStatusMessage: FC<JobResultsStatusMessageProps> = ({ job, files, submittingOrgSlug }) => {
    const { isApproved, isRejected, isFilesRejected, isErrored } = useJobStatus(job.statusChanges)

    let message: string
    let additionalContent: ReactNode = null
    let hideResults = false

    if (isApproved) {
        if (isErrored) {
            const hasLogs = files.some((file) => isLogType(file.fileType))

            if (hasLogs) {
                message = 'The code errored. Review error logs and consider re-submitting an updated study code.'
            } else {
                message =
                    'The code errored. While logs are not available at this time, consider re-submitting an updated study code.'
            }

            additionalContent = (
                <Group justify="flex-start" align="center">
                    <Text size="xs" fw="bold">
                        Job ID:
                    </Text>
                    <CopyingInput value={job.id} tooltipLabel="Copy" />
                </Group>
            )
        } else {
            message =
                'The results of your study have been approved by the data organization and are now available to you. If you are not satisfied with them, you can resubmit your code to generate a new outcome.'
        }
    } else if (isRejected) {
        if (isFilesRejected) {
            message =
                'The results of your study have not been released by the data organization, possibly due to the presence of personally identifiable information (PII). Consider resubmitting an updated study code.'
        } else {
            message =
                'This study code has not been approved by the data organization. Consider resubmitting an updated study code.'
        }
        hideResults = true
    } else {
        return <Text>Study results will become available once the data organization reviews and approves them.</Text>
    }

    return (
        <Stack>
            <Text>{message}</Text>
            {additionalContent}
            {!hideResults && <JobResults job={job} />}
            <Group>
                <ResubmitButton studyId={job.studyId} orgSlug={submittingOrgSlug} />
            </Group>
        </Stack>
    )
}
