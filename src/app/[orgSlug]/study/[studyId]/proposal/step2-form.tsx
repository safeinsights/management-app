'use client'

import { FC } from 'react'
import { Stack, Text, Paper } from '@mantine/core'

interface Step2FormProps {
    studyId: string
    orgSlug: string
}

export const Step2Form: FC<Step2FormProps> = ({ studyId, orgSlug }) => {
    return (
        <Stack gap="lg">
            <Paper p="xl" withBorder>
                <Text c="dimmed">
                    Step 2 content placeholder. Study ID: {studyId}, Org: {orgSlug}
                </Text>
            </Paper>
        </Stack>
    )
}
