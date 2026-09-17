'use client'

import type { ReactNode } from 'react'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { PlusCircleIcon } from '@phosphor-icons/react/dist/ssr'

const ROW_BORDER = { borderBottom: '1px solid var(--mantine-color-gray-3)' }

export function SettingsCardRow({ children }: { children: ReactNode }) {
    return <Box style={ROW_BORDER}>{children}</Box>
}

function CardDescription({ description }: { description?: ReactNode }) {
    if (!description) return null

    return (
        <Text size="sm" c="dimmed">
            {description}
        </Text>
    )
}

export type SettingsCardProps = {
    title: string
    addLabel: string
    onAdd: () => void
    description?: ReactNode
    slot?: ReactNode
    children: ReactNode
}

// The description goes below the header row, not inside it: its length pushes the add button onto
// its own line at narrower widths.
export function SettingsCard({ title, addLabel, onAdd, description, slot, children }: SettingsCardProps) {
    return (
        <Paper bg="white" p="xxl">
            <Stack>
                <Group justify="space-between" align="center">
                    <Title order={3} size="lg">
                        {title}
                    </Title>
                    <Button leftSection={<PlusCircleIcon size={16} />} onClick={onAdd}>
                        {addLabel}
                    </Button>
                </Group>
                <CardDescription description={description} />
                <Divider c="dimmed" />
                {slot}
                {children}
            </Stack>
        </Paper>
    )
}
