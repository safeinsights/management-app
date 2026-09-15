'use client'

import type { ReactNode } from 'react'
import { Anchor, Box, Group, Text } from '@mantine/core'
import { isHttpUrl } from '@/schema/url'
import { SettingsCard, SettingsCardRow } from './settings-card'

// Presentational only: the body and per-row action node are injected so these render without a
// QueryClient (e.g. Ladle).

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
    actions: ReactNode
}

// Rows persisted before the schema restricted schemes (OTTER-724) can hold a `javascript:` URL,
// which still executes when React renders it into an href.
function DataSourceUrlLink({ url, description }: { url: string; description: string | null }) {
    const linkable = isHttpUrl(url)

    return (
        <Group gap="sm" wrap="nowrap">
            <Text>
                {linkable ? (
                    <Anchor size="sm" href={url} target="_blank" rel="noopener noreferrer">
                        {url}
                    </Anchor>
                ) : (
                    <Text component="span" size="sm">
                        {url}
                    </Text>
                )}
            </Text>
            <Text c="dimmed" size="sm">
                {description}
            </Text>
        </Group>
    )
}

export function DataSourceRowView({ name, codeEnvNames, description, urls, actions }: DataSourceRowViewProps) {
    const linkedUrls = urls.filter((u): u is DataSourceUrlView & { url: string } => Boolean(u.url))

    return (
        <SettingsCardRow>
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
                    {linkedUrls.map((u) => (
                        <DataSourceUrlLink key={u.id} url={u.url} description={u.description} />
                    ))}
                </Box>
                <Group gap={4} wrap="nowrap">
                    {actions}
                </Group>
            </Group>
        </SettingsCardRow>
    )
}

export type DataSourcesViewProps = {
    onAdd: () => void
    children: ReactNode
}

export function DataSourcesView({ onAdd, children }: DataSourcesViewProps) {
    return (
        <SettingsCard title="Data Sources" addLabel="Add Data Source" onAdd={onAdd}>
            {children}
        </SettingsCard>
    )
}
