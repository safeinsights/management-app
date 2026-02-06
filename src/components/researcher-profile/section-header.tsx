'use client'

import { Button, Group, Title } from '@mantine/core'

interface SectionHeaderProps {
    title: string
    isEditing: boolean
    onEdit: () => void
    showEditButton?: boolean
}

export function SectionHeader({ title, isEditing, onEdit, showEditButton = true }: SectionHeaderProps) {
    return (
        <Group
            justify="space-between"
            align="center"
            mb="md"
            pb="sm"
            style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
        >
            <Title order={3}>{title}</Title>
            {showEditButton && !isEditing && (
                <Button variant="subtle" onClick={onEdit}>
                    Edit
                </Button>
            )}
        </Group>
    )
}
