'use client'

import { ActionIcon, Anchor, Box, Divider, Table } from '@mantine/core'
import { PencilSimpleIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { InfoTooltip } from '@/components/tooltip'
import classes from './positions-table.module.css'
import type { PositionValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

function AddPositionLink({ isVisible, onAdd }: { isVisible: boolean; onAdd: () => void }) {
    if (!isVisible) return null
    return (
        <Box mt="md">
            <Anchor component="button" onClick={onAdd}>
                + Add another current position
            </Anchor>
        </Box>
    )
}

function ActionHeaderCell({ isVisible, label }: { isVisible: boolean; label: string }) {
    if (!isVisible) return null
    return (
        <Table.Th w={80} ta="center">
            {label}
        </Table.Th>
    )
}

function ActionCell({
    isVisible,
    disabled,
    onClick,
    label,
    children,
}: {
    isVisible: boolean
    disabled?: boolean
    onClick: () => void
    label: string
    children: React.ReactNode
}) {
    if (!isVisible) return null
    return (
        <Table.Td ta="center">
            <InfoTooltip label="Save or cancel changes first" withArrow disabled={!disabled}>
                <ActionIcon
                    className={classes.actionIcon}
                    variant="subtle"
                    color="gray"
                    data-disabled={disabled || undefined}
                    onClick={disabled ? (e: React.MouseEvent) => e.preventDefault() : onClick}
                    aria-label={label}
                >
                    {children}
                </ActionIcon>
            </InfoTooltip>
        </Table.Td>
    )
}

interface PositionRowProps {
    position: PositionValues
    showEdit: boolean
    showDelete: boolean
    actionsDisabled: boolean
    onEdit: () => void
    onDelete: () => void
}

function PositionRow({ position, showEdit, showDelete, actionsDisabled, onEdit, onDelete }: PositionRowProps) {
    const profileUrlCell = position.profileUrl ? (
        <Anchor href={position.profileUrl} target="_blank">
            {position.profileUrl}
        </Anchor>
    ) : null

    return (
        <Table.Tr>
            <Table.Td>{position.affiliation}</Table.Td>
            <Table.Td>{position.position}</Table.Td>
            <Table.Td>{profileUrlCell}</Table.Td>
            <ActionCell isVisible={showEdit} disabled={actionsDisabled} onClick={onEdit} label="Edit current position">
                <PencilSimpleIcon weight="fill" />
            </ActionCell>
            <ActionCell
                isVisible={showDelete}
                disabled={actionsDisabled}
                onClick={onDelete}
                label="Delete current position"
            >
                <TrashIcon weight="fill" />
            </ActionCell>
        </Table.Tr>
    )
}

function FormRow({ columnCount, formSlot }: { columnCount: number; formSlot: React.ReactNode }) {
    return (
        <Table.Tr>
            <Table.Td colSpan={columnCount} p="lg">
                {formSlot}
            </Table.Td>
        </Table.Tr>
    )
}

interface PositionsTableProps {
    positions: PositionValues[]
    editingIndex: number | null
    form: UseFormReturnType<{ positions: PositionValues[] }>
    canDelete: boolean
    actionsDisabled: boolean
    readOnly?: boolean
    formSlot?: React.ReactNode
    onEdit: (index: number) => void
    onDelete: (index: number) => void
    onAdd: () => void
}

export function PositionsTable({
    positions,
    editingIndex,
    form,
    canDelete,
    actionsDisabled,
    readOnly = false,
    formSlot,
    onEdit,
    onDelete,
    onAdd,
}: PositionsTableProps) {
    const showEdit = !readOnly
    const showDelete = !readOnly && canDelete
    const columnCount = 3 + (showEdit ? 1 : 0) + (showDelete ? 1 : 0)

    const tableRows = positions.map((pos, idx) => {
        if (idx === editingIndex) {
            return <FormRow key={form.key(`positions.${idx}`)} columnCount={columnCount} formSlot={formSlot} />
        }
        return (
            <PositionRow
                key={form.key(`positions.${idx}`)}
                position={pos}
                showEdit={showEdit}
                showDelete={showDelete}
                actionsDisabled={actionsDisabled}
                onEdit={() => onEdit(idx)}
                onDelete={() => onDelete(idx)}
            />
        )
    })

    const isAddingNew = editingIndex !== null && editingIndex >= positions.length
    if (isAddingNew && formSlot) {
        tableRows.push(<FormRow key="new-position-form" columnCount={columnCount} formSlot={formSlot} />)
    }

    return (
        <>
            <Table withRowBorders horizontalSpacing="md" verticalSpacing="sm">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Institutional affiliation</Table.Th>
                        <Table.Th>Position</Table.Th>
                        <Table.Th>Profile page</Table.Th>
                        <ActionHeaderCell isVisible={showEdit} label="Edit" />
                        <ActionHeaderCell isVisible={showDelete} label="Delete" />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{tableRows}</Table.Tbody>
            </Table>
            <Divider />

            <AddPositionLink isVisible={!readOnly && !actionsDisabled} onAdd={onAdd} />
        </>
    )
}
