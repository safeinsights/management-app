'use client'

import type { FC } from '@/common'
import { Group, Paper, Title } from '@mantine/core'
import type { ReactNode } from 'react'

type Props = {
    // Optional for a document that carries its own title, so the name is not shown twice.
    title?: string
    // Right-aligned beside the title, for a panel that carries dates rather than a table.
    aside?: ReactNode
    children: ReactNode
}

const PanelTitle: FC<{ title?: string }> = ({ title }) => {
    if (!title) return null

    return <Title order={3}>{title}</Title>
}

export const LegalPanel: FC<Props> = ({ title, aside, children }) => (
    <Paper shadow="xs" p="xxl">
        <Group justify={title ? 'space-between' : 'flex-end'} align="flex-start" mb="lg" wrap="nowrap">
            <PanelTitle title={title} />
            {aside}
        </Group>
        {children}
    </Paper>
)
