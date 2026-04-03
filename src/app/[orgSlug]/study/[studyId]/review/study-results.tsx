'use client'

import { CopyingInput } from '@/components/copying-input'
import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import { JobResults } from '@/components/job-results'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { isEncryptedLogType } from '@/lib/file-type-helpers'
import { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
import { JobReviewButtons } from './job-review-buttons'

const ALLOWED_STATUS = ['FILES-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED', 'JOB-ERRORED']

export const StudyResults: FC<{
    job: LatestJobForStudy | null
    onFilesApproved?: (files: JobFileInfo[]) => void
}> = ({ job, onFilesApproved }) => {
    const [decryptedResults, setDecryptedResults] = useState<JobFileInfo[]>()

    const hasEncryptedLogs = job?.files?.some((f) => isEncryptedLogType(f.fileType)) ?? false

    if (!job?.statusChanges.find((sc) => ALLOWED_STATUS.includes(sc.status))) {
        const statuses = job?.statusChanges.map((sc) => sc.status) ?? []
        const awaitingScan = statuses.includes('CODE-SUBMITTED') && !statuses.includes('CODE-SCANNED')
        const codeApproved = statuses.includes('CODE-APPROVED')

        let message = 'Study results will become available once the proposal and code are approved and processed.'
        if (codeApproved) {
            message = 'Code has been approved and is being processed. Results will appear here once the run completes.'
        } else if (awaitingScan) {
            message = 'Code has been uploaded and is being scanned. Approve with caution after manually reviewing it'
        }

        return (
            <Paper bg="white" p="xxl">
                <Stack>
                    <Title order={4} size="xl">
                        Study Status
                    </Title>
                    <Divider c="dimmed" />
                    {job && (
                        <EncryptedFilesPanel
                            job={job}
                            onFilesApproved={(files) => {
                                setDecryptedResults(files)
                                onFilesApproved?.(files)
                            }}
                        />
                    )}
                    <Text>{message}</Text>
                </Stack>
            </Paper>
        )
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
                <JobStatusHelpText job={job} hasEncryptedLogs={hasEncryptedLogs} />
                <EncryptedFilesPanel
                    job={job}
                    onFilesApproved={(files) => {
                        setDecryptedResults(files)
                        onFilesApproved?.(files)
                    }}
                />
                <JobResults job={job} />
            </Stack>
        </Paper>
    )
}

export const JobStatusHelpText: FC<{
    job: LatestJobForStudy
    hasEncryptedLogs: boolean
}> = ({ job, hasEncryptedLogs }) => {
    const { isComplete, isErrored, isApproved, isRejected, isFilesRejected } = useJobStatus(job.statusChanges)

    if (isApproved) {
        return <Text>The results and logs have been approved and shared with the researcher.</Text>
    }

    if (isRejected) {
        if (isFilesRejected) {
            return (
                <Text>
                    The results have been rejected and will not be shared with the researcher. The researcher may
                    resubmit updated code.
                </Text>
            )
        }
        return <Text>The study code has been rejected. The researcher may revise and resubmit updated code.</Text>
    }

    if (isErrored) {
        return (
            <Stack gap="xs">
                <Text>
                    The code errored out!{' '}
                    {hasEncryptedLogs
                        ? 'Review the error logs before these can be shared with the researcher.'
                        : 'While logs are not available at this time, consider re-submitting an updated study code.'}
                </Text>
                {hasEncryptedLogs && (
                    <Group justify="flex-start" align="center">
                        <Text size="sm" fw={600}>Job ID:</Text>
                        <CopyingInput value={job.id} tooltipLabel="Copy" />
                    </Group>
                )}
            </Stack>
        )
    }

    if (isComplete) {
        return (
            <Text>
                The code was successfully processed! Review results before these can be released to the researcher.
            </Text>
        )
    }

    return null
}
