'use client'

import { Stack, Title, Divider, Paper, Text } from '@mantine/core'

export function ApiKeySettingsDisplay() {
    return null // This component is currently under design, so we return null to avoid rendering anything.

    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Title order={4} size="xl">
                    API key
                </Title>
                <Divider c="dimmed" />
                <Text fz="sm" fw={600}>
                    Section Under Design
                </Text>
            </Stack>
        </Paper>
    )
}
