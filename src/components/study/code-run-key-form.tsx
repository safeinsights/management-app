'use client'

import { Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { FC } from 'react'
import { LocalDateTime } from '@/components/local-date-time'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import type { StudyJobStatus } from '@/database/types'
import { codeRunEndedAt } from '@/lib/outputs-review'
import type { JobFileInfo } from '@/lib/types'
import { fontWeight, semanticColor } from '@/theme/tokens'

interface CodeRunKeyFormProps {
    job: { id: string; statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }> }
    description: string
    onDecrypted: (files: JobFileInfo[]) => void
}

// The reviewer's key form for the latest run. Researchers keep SecurityKeyForm.
export const CodeRunKeyForm: FC<CodeRunKeyFormProps> = ({ job, description, onDecrypted }) => {
    const runEndedAt = codeRunEndedAt(job.statusChanges)

    return (
        <Paper p="xxl" data-testid="security-key-form">
            <Stack gap="lg">
                <Title fz="xl" fw={fontWeight.bold} c={semanticColor('text.primary')} order={3}>
                    Code run{runEndedAt ? <LocalDateTime value={runEndedAt} prefix=" • " /> : ' • —'}
                </Title>
                <Divider />
                <Text fz="lg" fw={fontWeight.bold} c={semanticColor('text.primary')}>
                    Output files
                </Text>
                <Stack gap="xs">
                    <Text fz="md" fw={fontWeight.bold} c={semanticColor('text.primary')}>
                        Security key{' '}
                        <Text component="span" c={semanticColor('error.text')} inherit aria-label="required">
                            *
                        </Text>
                    </Text>
                    <Text fz="md" c={semanticColor('text.primary')}>
                        {description}
                    </Text>
                </Stack>
                {/* Reviewers decrypt via the zip's embedded manifest and hold no re-wrapped per-file
                    keys, so the researcher key set would come back empty. */}
                <SecurityKeyFields job={job} type="reviewer" buttonLabel="View files" onDecrypted={onDecrypted} />
            </Stack>
        </Paper>
    )
}
