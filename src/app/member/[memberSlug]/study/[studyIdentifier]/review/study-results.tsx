'use client'

import React, { FC, useState } from 'react'
import { Group, Paper, Stack, Text, Title } from '@mantine/core'
import type { StudyJob } from '@/schema/study'
import { JobReviewButtons } from './job-review-buttons'
import { ViewJobResultsCSV } from '@/components/view-job-results-csv'
import { StudyJobStatus } from '@/database/types'
import { ViewUnapprovedResults, type FileEntry } from './view-unapproved-results'

export const StudyResults: FC<{
    latestJob: StudyJob | null
    fingerprint: string | undefined
    jobStatus: StudyJobStatus | null
}> = ({ latestJob, fingerprint, jobStatus }) => {
    const [decryptedResults, setDecryptedResults] = useState<FileEntry[]>()

    if (!latestJob) {
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

    if (jobStatus === 'RESULTS-REJECTED') {
        return (
            <Paper bg="white" p="xl">
                <Title order={4}>Latest results rejected</Title>
            </Paper>
        )
    }

    if (!jobStatus || !['RESULTS-APPROVED', 'RUN-COMPLETE'].includes(jobStatus)) {
        return null // nothing to display
    }

    return (
        <Paper bg="white" p="xl">
            <Stack>
                <Group justify="space-between">
                    <Title order={4}>Study Results</Title>
                    <JobReviewButtons job={latestJob} decryptedResults={decryptedResults} />
                </Group>
                <ViewUnapprovedResults job={latestJob} jobStatus={jobStatus} onApproval={setDecryptedResults} />
                {jobStatus === 'RESULTS-APPROVED' && <ViewJobResultsCSV job={latestJob} />}
            </Stack>
        </Paper>
    )
}
