'use client'

import { Stack, Title, Divider, Paper, Text } from '@mantine/core'
import { fontWeight, semanticColor } from '@/theme/tokens'

export function ApiKeySettingsDisplay() {
    // Under design; renders nothing for now.
    return null

    return (
        <Paper bg={semanticColor('surface.raised')} p="xxl">
            <Stack>
                <Title order={4} size="xl">
                    API key
                </Title>
                <Divider c="dimmed" />
                <Text fz="sm" fw={fontWeight.semibold}>
                    Section Under Design
                </Text>
            </Stack>
        </Paper>
    )
}
