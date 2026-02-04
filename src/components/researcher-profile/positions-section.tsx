'use client'

import { Paper } from '@mantine/core'
import { usePositionsSection } from '@/hooks/use-positions-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { PositionsTable } from '@/components/researcher-profile/positions-table'
import { PositionForm } from '@/components/researcher-profile/position-form'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface PositionsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function PositionsSection({ data, refetch }: PositionsSectionProps) {
    const {
        form,
        editingIndex,
        defaults,
        isPending,
        hasExistingPositions,
        showForm,
        isAdding,
        currentEditValid,
        openEdit,
        openAdd,
        cancelEdit,
        handleSubmit,
        handleDelete,
    } = usePositionsSection(data, refetch)

    const canDelete = defaults.positions.length >= 2

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Current institutional information"
                isEditing={false}
                onEdit={() => {}}
                showEditButton={false}
            />

            <PositionsTable
                isVisible={hasExistingPositions}
                positions={defaults.positions}
                editingIndex={editingIndex}
                form={form}
                canDelete={canDelete}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAdd={openAdd}
            />

            <PositionForm
                isVisible={showForm && editingIndex !== null}
                editingIndex={editingIndex ?? 0}
                form={form}
                isAdding={isAdding}
                hasExistingPositions={hasExistingPositions}
                currentEditValid={currentEditValid}
                isPending={isPending}
                onSubmit={handleSubmit}
                onCancel={cancelEdit}
            />
        </Paper>
    )
}
