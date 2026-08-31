import type { ReactNode } from 'react'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { StepNavigation } from '@/components/study/step-navigation'
import type { StepNav } from '@/lib/study-screen'

// Presentational Study Details page (OTTER-538 results-stage view, RL). Owns the page chrome
// — title, the "Study Status" card, and the step nav — but receives the
// status message via the `statusMessage` slot so it stays free of data fetching (JobResults'
// useQuery + server action) and renders in isolation (e.g. Ladle). The StudyDetailsResearcher
// container (./study-details-researcher) injects the real <JobResultsStatusMessage>.
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
