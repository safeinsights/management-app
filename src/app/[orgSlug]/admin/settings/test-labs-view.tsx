'use client'

import type { ReactNode } from 'react'
import { Stack, Table, Text, Title, VisuallyHidden } from '@mantine/core'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'
import { fontWeight } from '@/theme/tokens'
import { SettingsCard } from './settings-card'

// Presentational only, so the section renders without a QueryClient (e.g. Ladle).

// The header cannot see its rows, so it takes a flag; a row has an actions cell exactly when it is
// given actions. The caller derives both from one value, so header and cells cannot misalign.
function ActionsHeader({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null

    return (
        <Table.Th>
            <VisuallyHidden>Actions</VisuallyHidden>
        </Table.Th>
    )
}

export type TestLabRowViewProps = {
    name: string
    addedOn: string
    actions?: ReactNode
}

export function TestLabRowView({ name, addedOn, actions }: TestLabRowViewProps) {
    return (
        <Table.Tr>
            <Table.Td>{name}</Table.Td>
            <Table.Td>{addedOn}</Table.Td>
            {actions != null && <Table.Td>{actions}</Table.Td>}
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
