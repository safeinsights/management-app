import { Stack, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { fontWeight } from '@/theme/tokens'

export function AnalysisPanel({
    title,
    description,
    testId,
    children,
}: {
    title: string
    description: string
    testId: string
    children: ReactNode
}) {
    return (
        <Stack gap="lg" data-testid={testId}>
            <Stack gap="xxs">
                <Text fw={fontWeight.bold}>{title}</Text>
                <Text size="xs" c="dimmed">
                    {description}
                </Text>
            </Stack>
            {children}
        </Stack>
    )
}
