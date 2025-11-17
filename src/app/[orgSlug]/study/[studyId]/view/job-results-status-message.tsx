import { CopyingInput } from '@/components/copying-input'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { LatestJobForStudy } from '@/server/db/queries'
import { Group, Stack, Text } from '@mantine/core'
import { FC, ReactNode } from 'react'
import { ResubmitButton } from '@/components/study/resubmit-button'
import { JobResults } from '@/components/job-results'
import { type FileType } from '@/database/types'

export type JobResultsStatusMessageProps = {
    job: LatestJobForStudy
    orgSlug: string
    files: { fileType: FileType }[]
}

export const JobResultsStatusMessage: FC<JobResultsStatusMessageProps> = ({ job, orgSlug, files }) => {
    const { isApproved, isRejected, isFilesRejected, isErrored } = useJobStatus(job.statusChanges)

    const errorStatusChange = job.statusChanges.find((sc) => sc.status === 'JOB-ERRORED')
    const errorMessage = errorStatusChange?.message

    let message: string
    let additionalContent: ReactNode = null
    let hideResults = false
    if (isApproved) {
        if (isErrored) {
            const hasLogs = files.some((file) => file.fileType.endsWith('-LOG'))

            if (hasLogs) {
                message = 'The code errored. Review error logs and consider resubmitting an updated study code.'
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
        return <Text>Study results will become available once the data organization reviews and approvals them.</Text>
    }

    return (
        <Stack>
            <Text>{message}</Text>
            {errorMessage && (
                <Stack gap="xs">
                    <Text size="sm" fw="bold">
                        Error Details:
                    </Text>
                    <Text
                        size="sm"
                        c="dimmed"
                        style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}
                    >
                        {errorMessage}
                    </Text>
                </Stack>
            )}
            {additionalContent}
            {!hideResults && <JobResults job={job} />}
            <Group>
                <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />
            </Group>
        </Stack>
    )
}
