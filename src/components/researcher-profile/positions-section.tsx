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

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Current institutional information"
                isEditing={false}
                onEdit={() => {}}
                showEditButton={false}
            />

            {hasExistingPositions && (
                <PositionsTable
                    positions={defaults.positions}
                    editingIndex={editingIndex}
                    form={form}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onAdd={openAdd}
                />
            )}

            {showForm && editingIndex !== null && (
                <PositionForm
                    editingIndex={editingIndex}
                    form={form}
                    isAdding={isAdding}
                    hasExistingPositions={hasExistingPositions}
                    currentEditValid={currentEditValid}
                    isPending={isPending}
                    onSubmit={handleSubmit}
                    onCancel={cancelEdit}
                />
            )}
        </Paper>
    )
}
