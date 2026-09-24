'use client'

import type { ReactNode } from 'react'
import { Stack, Table, Text, Title, VisuallyHidden } from '@mantine/core'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { fontWeight } from '@/theme/tokens'
import { SettingsCard } from './settings-card'

// Presentational only, so the section renders without a QueryClient (e.g. Ladle).

// The header and every row take the same flag, so the table never has a header the rows lack or
// cells the header lacks.
function ActionsHeader({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null

    return (
        <Table.Th>
            <VisuallyHidden>Actions</VisuallyHidden>
        </Table.Th>
    )
}

function ActionsCell({ isVisible, children }: { isVisible: boolean; children: ReactNode }) {
    if (!isVisible) return null

    return <Table.Td>{children}</Table.Td>
}

export type TestLabRowViewProps = {
    name: string
    addedOn: string
    hasActions: boolean
    actions?: ReactNode
}

export function TestLabRowView({ name, addedOn, hasActions, actions }: TestLabRowViewProps) {
    return (
        <Table.Tr>
            <Table.Td>
                <Text fw={fontWeight.semibold}>{name}</Text>
            </Table.Td>
            <Table.Td>{addedOn}</Table.Td>
            <ActionsCell isVisible={hasActions}>{actions}</ActionsCell>
        </Table.Tr>
    )
}

export function TestLabsTableView({ hasActions, children }: { hasActions: boolean; children: ReactNode }) {
    return (
        <Stack gap="sm">
            <Title order={4} size="md">
                Existing Test Labs
            </Title>
            <Table>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Organization</Table.Th>
                        <Table.Th>Added on</Table.Th>
                        <ActionsHeader isVisible={hasActions} />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{children}</Table.Tbody>
            </Table>
        </Stack>
    )
}

export function TestLabsEmptyView() {
    return (
        <Stack gap="xxs" align="center" p="md">
            <Text fw={fontWeight.semibold}>No Test Labs added yet</Text>
            <Text fz="sm" c="dimmed">
                Added labs will appear here.
            </Text>
        </Stack>
    )
}

function TestLabsDescription() {
    return (
        <>
            Add Research Labs as Test Labs to test your enclave and system functionality. Studies submitted to you from
            your Test Labs do not require {legalDocumentCollectionLabels.SLA}.
        </>
    )
}

export type TestLabsViewProps = {
    onAdd: () => void
    children: ReactNode
}

export function TestLabsView({ onAdd, children }: TestLabsViewProps) {
    return (
        <SettingsCard title="Test Labs" addLabel="Add Test Lab" onAdd={onAdd} description={<TestLabsDescription />}>
            {children}
        </SettingsCard>
    )
}
