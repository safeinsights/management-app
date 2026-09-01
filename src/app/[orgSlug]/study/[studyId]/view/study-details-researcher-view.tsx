import type { ReactNode } from 'react'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { StepNavigation } from '@/components/study/step-navigation'
import type { StepNav } from '@/lib/study-screen'

// The status message arrives via a slot, keeping this free of data fetching so it renders in
// isolation (e.g. Ladle).
export type StudyDetailsResearcherViewProps = {
    nav: StepNav
    statusMessage: ReactNode
}

export function StudyDetailsResearcherView({ nav, statusMessage }: StudyDetailsResearcherViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <Title order={2} size="h4" fw={500}>
                Study Details
            </Title>
            <Divider />
            <Paper bg="white" p="xxl">
                <Stack>
                    <Group justify="space-between" align="center">
                        <Title order={3} size="xl">
                            Study Status
                        </Title>
                    </Group>
                    <Divider c="dimmed" />
                    {statusMessage}
                </Stack>
            </Paper>
            <StepNavigation nav={nav} />
        </Stack>
    )
}
