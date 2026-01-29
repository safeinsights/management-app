'use client'

import { Paper } from '@mantine/core'
import { useCurrentPositionsSection } from '@/hooks/use-current-positions-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { PositionsTable } from '@/components/researcher-profile/positions-table'
import { PositionForm } from '@/components/researcher-profile/position-form'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface CurrentPositionsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function CurrentPositionsSection({ data, refetch }: CurrentPositionsSectionProps) {
    const {
        form,
        editingIndex,
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
    } = useCurrentPositionsSection(data, refetch)

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
                    positions={form.values.positions}
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
