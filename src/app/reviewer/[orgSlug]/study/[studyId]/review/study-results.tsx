'use client'

import React, { FC, useState } from 'react'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { JobReviewButtons } from './job-review-buttons'
import { DecryptResults } from './decrypt-results'
import type { LatestJobForStudy } from '@/server/db/queries'
import { FileEntryWithJobFileInfo } from '@/lib/types'
import { first } from 'remeda'

const ALLOWED_STATUS = ['FILES-APPROVED', 'RUN-COMPLETE', 'FILES-REJECTED', 'JOB-ERRORED']

export const StudyResults: FC<{
    job: LatestJobForStudy | null
}> = ({ job }) => {
    const [decryptedResults, setDecryptedResults] = useState<FileEntryWithJobFileInfo[]>()

    if (!job) {
        return (
            <Paper bg="white" p="xl">
                <Text>Study results are not available yet</Text>
            </Paper>
        )
    }

    // Empty state, no results yet
    if (!job.statusChanges.find((sc) => ALLOWED_STATUS.includes(sc.status))) {
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
            </Stack>
        </Paper>
    )
}

export const JobStatusHelpText: FC<{ job: LatestJobForStudy }> = ({ job }) => {
    const latestStatusChange = first(job.statusChanges)

    if (latestStatusChange?.status === 'JOB-ERRORED') {
        return <Text>The code errored out! Review the error logs before these can be shared with the researcher.</Text>
    }

    if (latestStatusChange?.status === 'RUN-COMPLETE') {
        return (
            <Text>
                The code was successfully processed! Review results before these can be released to the researcher.
            </Text>
        )
    }

    return null
}
