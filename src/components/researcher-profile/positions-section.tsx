'use client'

import { Paper } from '@mantine/core'
import { usePositionsSection } from '@/hooks/use-positions-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { PositionsTable } from '@/components/researcher-profile/positions-table'
import { PositionForm, PositionFormActions } from '@/components/researcher-profile/position-form'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface PositionsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

export function PositionsSection({ data, refetch, readOnly = false }: PositionsSectionProps) {
    const {
        form,
        editingIndex,
        defaults,
        isPending,
        hasExistingPositions,
        canDelete,
        isAdding,
        currentEditValid,
        openEdit,
        openAdd,
        cancelEdit,
        handleSubmit,
        handleDelete,
    } = usePositionsSection(data, refetch)

    const isFormVisible = !readOnly && editingIndex !== null
    const actionsDisabled = editingIndex !== null

    const formFields = (
        <PositionForm
            isVisible={isFormVisible}
            editingIndex={editingIndex ?? 0}
            form={form}
            isAdding={isAdding}
            hasExistingPositions={hasExistingPositions}
            onSubmit={handleSubmit}
        />
    )

    if (readOnly && !hasExistingPositions) return null

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
                actionsDisabled={actionsDisabled}
                readOnly={readOnly}
                formSlot={formFields}
                onEdit={openEdit}
                onDelete={handleDelete}
                onAdd={openAdd}
            />

            {/* Shown only when no positions exist; otherwise the form renders inside PositionsTable */}
            <PositionForm
                isVisible={!hasExistingPositions && isFormVisible}
                editingIndex={editingIndex ?? 0}
                form={form}
                isAdding={isAdding}
                hasExistingPositions={hasExistingPositions}
                onSubmit={handleSubmit}
            />

            <PositionFormActions
                isVisible={isFormVisible}
                hasExistingPositions={hasExistingPositions}
                currentEditValid={currentEditValid}
                isPending={isPending}
                onCancel={cancelEdit}
            />
        </Paper>
    )
}
