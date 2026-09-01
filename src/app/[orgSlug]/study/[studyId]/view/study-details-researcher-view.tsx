import type { ReactNode } from 'react'
import type { Route } from 'next'
import { Divider, Group, Paper, Stack, Title } from '@mantine/core'
import { CaretLeftIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'

// The status message arrives via a slot, keeping this free of data fetching so it renders in
// isolation (e.g. Ladle).
export type StudyDetailsResearcherViewProps = {
    previousHref?: Route
    statusMessage: ReactNode
}

export function StudyDetailsResearcherView({ previousHref, statusMessage }: StudyDetailsResearcherViewProps) {
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
            {previousHref && (
                <Group>
                    <ButtonLink href={previousHref} variant="subtle" leftSection={<CaretLeftIcon />}>
                        Previous
                    </ButtonLink>
                </Group>
            )}
        </Stack>
    )
}
