'use client'

import { CopyingInput } from '@/components/copying-input'
import { JobResults } from '@/components/job-results'
import { useJobStatus } from '@/hooks/use-job-results-status'
import { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
import { DecryptResults } from './decrypt-results'
import { JobReviewButtons } from './job-review-buttons'

const ALLOWED_STATUS = ['FILES-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED', 'JOB-ERRORED']

export const StudyResults: FC<{
    job: LatestJobForStudy | null
}> = ({ job }) => {
    const [decryptedResults, setDecryptedResults] = useState<JobFileInfo[]>()

    const hasEncryptedLogs = job?.files?.some((f) => f.fileType === 'ENCRYPTED-LOG') ?? false

    // Empty state, no results yet
    if (!job?.statusChanges.find((sc) => ALLOWED_STATUS.includes(sc.status))) {
        return (
            <Paper bg="white" p="xxl">
                <Stack>
                    <Title order={4} size="xl">
                        Study Status
                    </Title>
                    <Divider c="dimmed" />
                    <Text>
                        Study results will become available once the proposal and code are approved and processed.
                    </Text>
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
                <DecryptResults job={job} onApproval={setDecryptedResults} />
                <JobResults job={job} />
            </Stack>
        </Paper>
    )
}

export const JobStatusHelpText: FC<{
    job: LatestJobForStudy
    hasEncryptedLogs: boolean
}> = ({ job, hasEncryptedLogs }) => {
    const { isComplete, isErrored, isApproved } = useJobStatus(job.statusChanges)

    if (isApproved) {
        return <Text>The results and logs have been approved and shared with the researcher.</Text>
    }

    if (isErrored) {
        return (
            <Stack gap="xs">
                <Text>
                    The code errored out!{' '}
                    {hasEncryptedLogs
                        ? 'Review the error logs before these can be shared with the researcher.'
                        : 'Unknown reason, no logs were sent.'}
                </Text>
                {hasEncryptedLogs && (
                    <Group justify="flex-start" align="center">
                        <Text fw={650}>Job ID:</Text>
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
