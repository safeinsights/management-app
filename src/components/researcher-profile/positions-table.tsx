'use client'

import { ActionIcon, Anchor, Box, Table } from '@mantine/core'
import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import type { PositionValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

interface PositionsTableProps {
    isVisible?: boolean
    positions: PositionValues[]
    editingIndex: number | null
    form: UseFormReturnType<{ positions: PositionValues[] }>
    canDelete: boolean
    onEdit: (index: number) => void
    onDelete: (index: number) => void
    onAdd: () => void
}

export function PositionsTable({
    isVisible = true,
    positions,
    editingIndex,
    form,
    canDelete,
    onEdit,
    onDelete,
    onAdd,
}: PositionsTableProps) {
    if (!isVisible) return null
    const visiblePositions = positions.map((pos, idx) => ({ pos, idx })).filter(({ idx }) => idx !== editingIndex)

    const tableRows = visiblePositions.map(({ pos, idx }) => {
        const profileUrlCell = pos.profileUrl ? (
            <Anchor href={pos.profileUrl} target="_blank">
                {pos.profileUrl}
            </Anchor>
        ) : null

        return (
            <Table.Tr key={form.key(`positions.${idx}`)}>
                <Table.Td>{pos.affiliation}</Table.Td>
                <Table.Td>{pos.position}</Table.Td>
                <Table.Td>{profileUrlCell}</Table.Td>
                <Table.Td ta="center">
                    <ActionIcon variant="subtle" onClick={() => onEdit(idx)} aria-label="Edit current position">
                        <PencilSimpleIcon />
                    </ActionIcon>
                </Table.Td>
                {canDelete && (
                    <Table.Td ta="center">
                        <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => onDelete(idx)}
                            aria-label="Delete current position"
                        >
                            <TrashIcon />
                        </ActionIcon>
                    </Table.Td>
                )}
            </Table.Tr>
        )
    })

    return (
        <>
            <Table withTableBorder withColumnBorders>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Institutional affiliation</Table.Th>
                        <Table.Th>Position</Table.Th>
                        <Table.Th>Profile page</Table.Th>
                        <Table.Th w={80} ta="center">
                            Edit
                        </Table.Th>
                        {canDelete && (
                            <Table.Th w={80} ta="center">
                                Delete
                            </Table.Th>
                        )}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{tableRows}</Table.Tbody>
            </Table>

            <Box mt="md">
                <Anchor component="button" onClick={onAdd}>
                    + Add another current position
                </Anchor>
            </Box>
        </>
    )
}
