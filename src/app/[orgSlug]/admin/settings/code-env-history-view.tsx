'use client'

import { Badge, Group, Stack, Table, Text } from '@mantine/core'
import type { AuditEventType } from '@/database/types'
import type { CodeEnvAuditMetadata } from '@/lib/audit-diff'

// Presentational pieces for the code environment history modal. Data fetching lives in
// the useCodeEnvHistory hook; these render plain values so they work in isolation.

export type CodeEnvHistoryEntry = {
    id: string
    createdAt: Date
    eventType: AuditEventType
    userFullName: string | null
    metadata: CodeEnvAuditMetadata
}

const EVENT_LABELS: Partial<Record<AuditEventType, { color: string; label: string }>> = {
    CREATED: { color: 'teal', label: 'Created' },
    UPDATED: { color: 'blue', label: 'Updated' },
    DELETED: { color: 'red', label: 'Deleted' },
}

const FIELD_LABELS: Record<string, string> = {
    name: 'Name',
    identifier: 'Identifier',
    language: 'Language',
    commandLines: 'Command lines',
    url: 'Image URL',
    isTesting: 'Testing environment',
    settings: 'Environment variables',
    sampleDataPath: 'Sample data path',
    dataSourceType: 'Data source type',
    starterCodeFileNames: 'Starter code files',
}

const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'string') return value === '' ? '—' : value
    if (Array.isArray(value)) return value.length ? value.join(', ') : '—'
    return JSON.stringify(value)
}

const formatTimestamp = (value: Date) =>
    new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const EventBadge: React.FC<{ eventType: AuditEventType }> = ({ eventType }) => {
    const config = EVENT_LABELS[eventType]
    if (!config) return null
    return (
        <Badge color={config.color} variant="light" size="sm">
            {config.label}
        </Badge>
    )
}

const StarterCodeBadge: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    // "Replaced" rather than "uploaded": the server wiped and rewrote the folder, but the
    // files themselves are pushed by the browser after the action returns.
    return (
        <Badge color="grape" variant="light" size="sm">
            Starter code replaced
        </Badge>
    )
}

const ChangeList: React.FC<{ changes: CodeEnvAuditMetadata['changes'] }> = ({ changes }) => {
    if (!changes.length) return <Text c="dimmed">No field changes</Text>
    return (
        <Stack gap={4}>
            {changes.map((change) => (
                <Text key={change.field} size="sm">
                    <Text span fw={600}>
                        {FIELD_LABELS[change.field] ?? change.field}
                    </Text>
                    {': '}
                    <Text span c="dimmed">
                        {formatValue(change.before)}
                    </Text>
                    {' → '}
                    <Text span>{formatValue(change.after)}</Text>
                </Text>
            ))}
        </Stack>
    )
}

const HistoryRow: React.FC<{ entry: CodeEnvHistoryEntry }> = ({ entry }) => (
    <Table.Tr>
        <Table.Td valign="top">
            <Text size="sm">{formatTimestamp(entry.createdAt)}</Text>
        </Table.Td>
        <Table.Td valign="top">
            <Text size="sm">{entry.userFullName ?? 'Unknown user'}</Text>
        </Table.Td>
        <Table.Td valign="top">
            <Group gap={4}>
                <EventBadge eventType={entry.eventType} />
                <StarterCodeBadge isVisible={Boolean(entry.metadata.starterCodeReplaced)} />
            </Group>
        </Table.Td>
        <Table.Td>
            <ChangeList changes={entry.metadata.changes} />
        </Table.Td>
    </Table.Tr>
)

export const CodeEnvHistoryTable: React.FC<{ isVisible: boolean; entries: CodeEnvHistoryEntry[] }> = ({
    isVisible,
    entries,
}) => {
    if (!isVisible) return null

    return (
        <Table withRowBorders horizontalSpacing="md" verticalSpacing="sm">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>When</Table.Th>
                    <Table.Th>Who</Table.Th>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Changes</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {entries.map((entry) => (
                    <HistoryRow key={entry.id} entry={entry} />
                ))}
            </Table.Tbody>
        </Table>
    )
}

export const CodeEnvHistoryEmpty: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Text c="dimmed">No changes have been recorded for this code environment yet.</Text>
}
