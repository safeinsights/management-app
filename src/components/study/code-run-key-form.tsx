'use client'

import { Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { FC } from 'react'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { useSecurityKeyForm } from '@/components/study/use-security-key-form'
import type { StudyJobStatus } from '@/database/types'
import { formatInstant } from '@/lib/dates'
import { codeRunEndedAt } from '@/lib/study-job-status'
import type { JobFileInfo } from '@/lib/types'
import { fontWeight, semanticColor } from '@/theme/tokens'

interface CodeRunKeyFormProps {
    job: { id: string; statusChanges: ReadonlyArray<{ status: StudyJobStatus; createdAt: Date | string }> }
    description: string
    onDecrypted: (files: JobFileInfo[]) => void
}

// The reviewer's key form for the latest run. Researchers keep SecurityKeyForm.
export const CodeRunKeyForm: FC<CodeRunKeyFormProps> = ({ job, description, onDecrypted }) => {
    const { value, setValue, error, isDecrypting, isLoadingFiles, inputRef, handleSubmit } = useSecurityKeyForm({
        job,
        type: 'reviewer',
        onDecrypted,
    })
    const runDate = formatInstant(codeRunEndedAt(job.statusChanges))

    return (
        <Paper p="xxl" data-testid="security-key-form">
            <Stack gap="lg">
                <Title fz="xl" fw={fontWeight.bold} c={semanticColor('text.primary')} order={3}>
                    Code run • {runDate}
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
                <SecurityKeyInput
                    ref={inputRef}
                    autoFocus
                    placeholder="Enter your security key"
                    value={value}
                    onChange={(event) => setValue(event.currentTarget.value)}
                    error={error}
                    disabled={isDecrypting}
                />
                <SecurityKeyViewButton
                    isDecrypting={isDecrypting}
                    isLoading={isLoadingFiles}
                    idleLabel="View files"
                    onClick={handleSubmit}
                />
                <LostKeyPopover />
            </Stack>
        </Paper>
    )
}
