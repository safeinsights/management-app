'use client'

import React, { FC, useState } from 'react'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { JobReviewButtons } from './job-review-buttons'
import { DecryptResults } from './decrypt-results'
import type { LatestJobForStudy } from '@/server/db/queries'
import { JobFileInfo } from '@/lib/types'
import { JobResults } from '@/components/job-results'

const ALLOWED_STATUS = ['FILES-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED', 'JOB-ERRORED']

export const StudyResults: FC<{
    job: LatestJobForStudy | null
}> = ({ job }) => {
    const [decryptedResults, setDecryptedResults] = useState<JobFileInfo[]>()

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
                <JobStatusHelpText job={job} />
                <DecryptResults job={job} onApproval={setDecryptedResults} />
                <JobResults job={job} />
            </Stack>
        </Paper>
    )
}

export const JobStatusHelpText: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const isComplete = !!job.statusChanges.find((sc) => sc.status === 'RUN-COMPLETE')
    const isErrored = !!job.statusChanges.find((sc) => sc.status === 'JOB-ERRORED')

    if (isErrored) {
        return <Text>The code errored out! Review the error logs before these can be shared with the researcher.</Text>
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
