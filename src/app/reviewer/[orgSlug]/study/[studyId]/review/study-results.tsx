'use client'

import React, { FC, useState } from 'react'
import { Group, Paper, Stack, Text, Title, Divider } from '@mantine/core'
import { JobReviewButtons } from './job-review-buttons'
import { ViewJobResultsCSV } from '@/components/view-job-results-csv'
import { DecryptResults, type FileEntry } from './decrypt-results'
import type { StudyJobWithLastStatus } from '@/server/db/queries'

const ALLOWED_STATUS = ['RESULTS-APPROVED', 'RUN-COMPLETE', 'RESULTS-REJECTED']

export const StudyResults: FC<{
    job: StudyJobWithLastStatus | null
}> = ({ job }) => {
    const [decryptedResults, setDecryptedResults] = useState<FileEntry[]>()

    if (!job) {
        return (
            <Paper bg="white" p="xl">
                <Text>Study results are not available yet</Text>
            </Paper>
        )
    }

    if (!job.statusChanges.find((sc) => ALLOWED_STATUS.includes(sc.status))) {
        return null // nothing to display
    }

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={4} size="xl">
                        Study Results
                    </Title>
                    <JobReviewButtons job={job} decryptedResults={decryptedResults} />
                </Group>
                <Divider c="dimmed" />
                <DecryptResults job={job} onApproval={setDecryptedResults} />
                <ViewJobResultsCSV job={job} />
            </Stack>
        </Paper>
    )
}
