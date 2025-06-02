'use client'

import React, { FC, useState } from 'react'
import { Group, Paper, Stack, Text, Title, Divider } from '@mantine/core'
import { JobReviewButtons } from './job-review-buttons'
import { ViewJobResultsCSV } from '@/components/view-job-results-csv'
import { DecryptResults, type FileEntry } from './decrypt-results'
import type { StudyJobWithLastStatus } from '@/server/db/queries'

export const StudyResults: FC<{
    job: StudyJobWithLastStatus | null
    fingerprint: string | undefined
}> = ({ job, fingerprint }) => {
    const [decryptedResults, setDecryptedResults] = useState<FileEntry[]>()

    if (!job) {
        return (
            <Paper bg="white" p="xl">
                <Text>Study results are not available yet</Text>
            </Paper>
        )
    }

    if (!fingerprint) {
        return (
            <Paper bg="white" p="xl">
                <Text>It looks like you have not generated a key yet.</Text>
                <Text>You cannot view results without a private key.</Text>
            </Paper>
        )
    }

    if (!['RESULTS-APPROVED', 'RUN-COMPLETE', 'RESULTS-REJECTED'].includes(job.latestStatus)) {
        return null // nothing to display
    }

    return (
        <Paper bg="white" p="xl">
            <Stack>
                <Group justify="space-between">
                    <Title order={4} size="xl">
                        Study Results
                    </Title>
                    <JobReviewButtons job={job} decryptedResults={decryptedResults} />
                </Group>
                <Divider />
                <DecryptResults job={job} onApproval={setDecryptedResults} />
                {job.latestStatus === 'RESULTS-APPROVED' && <ViewJobResultsCSV job={job} />}
            </Stack>
        </Paper>
    )
}
