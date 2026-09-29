'use client'

import type { FC } from '@/common'
import { Group, Paper, Title } from '@mantine/core'
import type { ReactNode } from 'react'

type Props = {
    title: string
    // Right-aligned beside the title, for a panel that carries dates rather than a table.
    aside?: ReactNode
    children: ReactNode
}

export const LegalPanel: FC<Props> = ({ title, aside, children }) => (
    <Paper shadow="xs" p="xl">
        <Group justify="space-between" align="flex-start" mb="lg" wrap="nowrap">
            <Title order={3}>{title}</Title>
            {aside}
        </Group>
        {children}
    </Paper>
)
