'use client'

import { Stack, Text } from '@mantine/core'
import { FC } from 'react'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import type { StudyJobStatus } from '@/database/types'
import type { JobFileInfo } from '@/lib/types'
import { fontWeight, semanticColor } from '@/theme/tokens'

interface CodeRunKeyFieldsProps {
    job: { id: string; statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }> }
    description: string
    onDecrypted: (files: JobFileInfo[]) => void
    onKeyAccepted?: (privateKey: string) => void
}

// The Output files section of the latest run's card, before its outputs are decrypted.
export const CodeRunKeyFields: FC<CodeRunKeyFieldsProps> = ({ job, description, onDecrypted, onKeyAccepted }) => (
    <Stack gap="lg" data-testid="security-key-form">
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
        <SecurityKeyFields
            job={job}
            type="reviewer"
            buttonLabel="View files"
            onDecrypted={onDecrypted}
            onKeyAccepted={onKeyAccepted}
        />
    </Stack>
)
