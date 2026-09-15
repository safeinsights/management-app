'use client'

import type { ReactNode } from 'react'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { legalDocumentCollectionLabels } from '@/schema/legal-document'

// Presentational only, so the section renders without a QueryClient (e.g. Ladle).

// No actions column: a test lab cannot be removed yet. designateTestLabs states what removal needs.
export function TestLabRowView({ name }: { name: string }) {
    return (
        <Box style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
            <Text fw={500} p="sm">
                {name}
            </Text>
        </Box>
    )
}

export type TestLabsViewProps = {
    onAdd: () => void
    children: ReactNode
}

export function TestLabsView({ onAdd, children }: TestLabsViewProps) {
    return (
        <Paper bg="white" p="xxl">
            <Stack>
                {/* Description below the row, not inside it: its length pushes the button onto its
                    own line at narrower widths. */}
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        Test Labs
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={onAdd}>
                        Add
                    </Button>
                </Group>
                <Text size="sm" c="dimmed">
                    For all studies in Research Labs that are marked as Test Labs, {legalDocumentCollectionLabels.SLA}{' '}
                    will not be created.
                </Text>
                <Divider c="dimmed" />
                {children}
            </Stack>
        </Paper>
    )
}
