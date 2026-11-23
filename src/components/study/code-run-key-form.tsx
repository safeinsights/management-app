'use client'

import { Stack, Text } from '@mantine/core'
import { FC } from 'react'
import { CodeRunSectionTitle } from '@/components/study/code-run-card'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import type { JobFileInfo } from '@/lib/types'
import { fontWeight, semanticColor } from '@/theme/tokens'

interface CodeRunKeyFieldsProps {
    job: { id: string }
    type: 'researcher' | 'reviewer'
    description: string
    onDecrypted: (files: JobFileInfo[]) => void
    onKeyAccepted?: (privateKey: string) => void
}

// The Output files section of the latest run's card, before its outputs are decrypted.
export const CodeRunKeyFields: FC<CodeRunKeyFieldsProps> = ({ job, type, description, onDecrypted, onKeyAccepted }) => (
    <Stack gap="lg" data-testid="security-key-form">
        <CodeRunSectionTitle>Output files</CodeRunSectionTitle>
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
        {/* Researchers decrypt via wrapped keys, reviewers via the zip manifest: the wrong type reads as "Invalid key". */}
        <SecurityKeyFields
            job={job}
            type={type}
            buttonLabel="View files"
            onDecrypted={onDecrypted}
            onKeyAccepted={onKeyAccepted}
        />
    </Stack>
)
