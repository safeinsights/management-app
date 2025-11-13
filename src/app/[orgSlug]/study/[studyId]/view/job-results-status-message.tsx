import { CopyingInput } from '@/components/copying-input'
import { useJobResultsStatus } from '@/components/use-job-results-status'
import { LatestJobForStudy } from '@/server/db/queries'
import { Group, Stack, Text } from '@mantine/core'
import { FC } from 'react'
import { ResubmitButton } from '@/components/study/resubmit-button'

interface ErroredProps {
    isApproved: boolean
    isRejected: boolean
    jobId: string
    statusChanges: LatestJobForStudy['statusChanges']
    studyId: string
    orgSlug: string
}

export const JobResultsStatusMessage: FC<{ job: LatestJobForStudy; orgSlug: string }> = ({ job, orgSlug }) => {
    const { isApproved, isRejected, isComplete, isErrored } = useJobResultsStatus(job.statusChanges)

    if (isErrored) {
        return (
            <Errored
                isApproved={isApproved}
                isRejected={isRejected}
                jobId={job.id}
                statusChanges={job.statusChanges}
                studyId={job.studyId}
                orgSlug={orgSlug}
            />
        )
    }

    if (isComplete) {
        if (isApproved) {
            return (
                <Stack>
                    <Text>
                        The results of your study have been approved by the data organization and are now available to
                        you. If you are not satisfied with them, you can resubmit your code to generate a new outcome.
                    </Text>
                    <Group>
                        <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />
                    </Group>
                </Stack>
            )
        }

        const isCodeRejected = job.statusChanges.some((sc) => sc.status === 'CODE-REJECTED')
        if (isCodeRejected) {
            return (
                <Stack>
                    <Text>
                        This study code has not been approved by the data organization. Consider resubmitting an updated
                        study code.
                    </Text>
                    <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />
                </Stack>
            )
        }
        if (isRejected) {
            return (
                <Stack>
                    <Text>
                        The results of your study have not been released by the data organization, possibly due to the
                        presence of personally identifiable information (PII). Consider re-submitting an updated study
                        code.
                    </Text>
                    <ResubmitButton studyId={job.studyId} orgSlug={orgSlug} />
                </Stack>
            )
        }
    }

    return <Text>Study results will become available once the data organization reviews and approvals them.</Text>
}

const Errored: FC<ErroredProps & { studyId: string; orgSlug: string }> = ({
    jobId,
    statusChanges,
    studyId,
    orgSlug,
}) => {
    let message: string | null = null
    // Find the error message from the JOB-ERRORED status change
    const errorStatusChange = statusChanges.find((sc) => sc.status === 'JOB-ERRORED')
    const errorMessage = errorStatusChange?.message

    const isCodeRejected = statusChanges.some((sc) => sc.status === 'CODE-REJECTED')
    const isFilesRejected = statusChanges.some((sc) => sc.status === 'FILES-REJECTED')

    if (isCodeRejected) {
        message =
            'The code errored out! While logs are not available at this time, consider re-submitting an updated study code.'
    } else if (isFilesRejected) {
        message = 'The results errored out! Review error logs and consider re-submitting an updated study code.'
    } else {
        message = 'The study job errored out! Review error logs and consider re-submitting an updated study code.'
    }

    if (!message) {
        return <Text>Study results will become available once the data organization reviews and approves them.</Text>
    }

    return (
        <Stack>
            <Text>{message}</Text>
            {errorMessage && (
                <Stack gap="xs">
                    <Text size="sm" fw="bold">
                        Error Details:
                    </Text>
                    <Text size="sm" c="dimmed" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                        {errorMessage}
                    </Text>
                </Stack>
            )}
            <Group justify="flex-start" align="center">
                <Text size="xs" fw="bold">
                    Job ID:
                </Text>
                <CopyingInput value={jobId} tooltipLabel="Copy" />
            </Group>
            {isCodeRejected && <ResubmitButton studyId={studyId} orgSlug={orgSlug} />}
        </Stack>
    )
}
