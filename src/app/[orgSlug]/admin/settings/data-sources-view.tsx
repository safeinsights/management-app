'use client'

import type { ReactNode } from 'react'
import { Anchor, Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'

// Presentational pieces for the "Data Sources" settings card. They own the card chrome
// and the visible row (name / code-env names / description / linked URLs) but NOT data
// fetching, the add/edit modals, or the per-row delete mutation — those stay in the
// DataSources container (./data-sources). The body and per-row action node are injected
// so these render in isolation (e.g. Ladle, which has no QueryClient).

export type DataSourceUrlView = {
    id: string
    url: string | null
    description: string | null
}

export type DataSourceRowViewProps = {
    name: string
    codeEnvNames: string
    description: string | null
    urls: DataSourceUrlView[]
    /** Edit/delete controls — injected by the container (they own mutation + modal). */
    actions: ReactNode
}

export function DataSourceRowView({ name, codeEnvNames, description, urls, actions }: DataSourceRowViewProps) {
    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Group justify="space-between" p="sm" wrap="nowrap">
                <Box style={{ minWidth: 0, flex: 1 }}>
                    <Group gap="sm" wrap="nowrap">
                        <Text fw={500}>{name}</Text>
                        <Text c="dimmed" size="sm">
                            {codeEnvNames}
                        </Text>
                    </Group>
                    {description && (
                        <Text size="sm" c="dimmed" lineClamp={1}>
                            {description}
                        </Text>
                    )}
                    {urls.map(
                        (u) =>
                            u.url && (
                                <Group key={u.id} gap="sm" wrap="nowrap">
                                    <Text>
                                        <Anchor size="sm" href={u.url} target="_blank" rel="noopener noreferrer">
                                            {u.url}
                                        </Anchor>
                                    </Text>
                                    <Text c="dimmed" size="sm">
                                        {u.description}
                                    </Text>
                                </Group>
                            ),
                    )}
                </Box>
                <Group gap={4} wrap="nowrap">
                    {actions}
                </Group>
            </Group>
        </Box>
    )
}

export type DataSourcesViewProps = {
    onAdd: () => void
    children: ReactNode
}

export function DataSourcesView({ onAdd, children }: DataSourcesViewProps) {
    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Data Sources
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={onAdd}>
                        Add Data Source
                    </Button>
                </Group>
                <Divider c="dimmed" />
                {children}
            </Stack>
        </Paper>
    )
}
