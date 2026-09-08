import type { ReactNode } from 'react'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { StepNavigation } from '@/components/study/step-navigation'
import type { StepNav } from '@/lib/study-screen'

// The header and the status message arrive via slots, keeping this free of data fetching so it
// renders in isolation (e.g. Ladle).
export type StudyDetailsResearcherViewProps = {
    header: ReactNode
    nav: StepNav
    statusMessage: ReactNode
}

export function StudyDetailsResearcherView({ header, nav, statusMessage }: StudyDetailsResearcherViewProps) {
    return (
        <Stack px="xl" py="xl" gap="xl">
            {header}
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
