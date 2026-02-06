'use client'

import { Button, Divider, Group, Title } from '@mantine/core'

interface SectionHeaderProps {
    title: string
    isEditing: boolean
    onEdit: () => void
    showEditButton?: boolean
}

export function SectionHeader({ title, isEditing, onEdit, showEditButton = true }: SectionHeaderProps) {
    const editButton = showEditButton && !isEditing && (
        <Button variant="subtle" onClick={onEdit}>
            Edit
        </Button>
    )

    return (
        <>
            <Group justify="space-between" align="center">
                <Title order={3}>{title}</Title>
                {editButton}
            </Group>
            <Divider my="md" />
        </>
    )
}
