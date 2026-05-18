'use client'

import { EncryptedFilesPanel } from '@/components/encrypted-files-panel'
import { JobFileInfo } from '@/lib/types'
import type { LatestJobForStudy } from '@/server/db/queries'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
import { JobReviewButtons } from './job-review-buttons'

// OTTER-538: replacement for StudyResults — always shows the new secondary text,
// hides the results table and Approve/Reject until the reviewer's key successfully decrypts.

const SECONDARY_TEXT =
    'The code was successfully processed! Review results and security logs (if available) to decide if these can be released to the researcher.'

export const StudyResultsRedesign: FC<{
    job: LatestJobForStudy
    onFilesApproved?: (files: JobFileInfo[]) => void
}> = ({ job, onFilesApproved }) => {
    const [decryptedResults, setDecryptedResults] = useState<JobFileInfo[]>()

    const handleFilesApproved = (files: JobFileInfo[]) => {
        setDecryptedResults(files)
        onFilesApproved?.(files)
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
                <Text>{SECONDARY_TEXT}</Text>
                <EncryptedFilesPanel
                    job={job}
                    onFilesApproved={handleFilesApproved}
                    hideKeyLabel
                    hideTableUntilDecrypted
                />
            </Stack>
        </Paper>
    )
}
