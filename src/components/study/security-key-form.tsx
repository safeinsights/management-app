'use client'

import { Paper, Stack } from '@mantine/core'
import { FC } from 'react'
import { FormSectionHeader } from '@/components/study/form-section-header'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import type { JobFileInfo } from '@/lib/types'

interface SecurityKeyFormProps {
    job: { id: string }
    onDecrypted: (files: JobFileInfo[]) => void
}

// The researcher's key card for shared outputs. Reviewers use CodeRunKeyFields.
export const SecurityKeyForm: FC<SecurityKeyFormProps> = ({ job, onDecrypted }) => (
    <Paper p="xxl" data-testid="security-key-form">
        <Stack gap="lg">
            <FormSectionHeader
                title="Security key"
                description="This key is required to access the outputs. It was issued to you during sign-up."
                required
            />
            <SecurityKeyFields job={job} type="researcher" onDecrypted={onDecrypted} />
        </Stack>
    </Paper>
)
