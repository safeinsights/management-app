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
    const isFormVisible = !readOnly && showForm && editingIndex !== null

    const formFieldsElement = (
        <PositionForm
            isVisible={isFormVisible}
            editingIndex={editingIndex ?? 0}
            form={form}
            isAdding={isAdding}
            hasExistingPositions={hasExistingPositions}
            onSubmit={handleSubmit}
        />
    )

    const formActionsElement = (
        <PositionFormActions
            isVisible={isFormVisible}
            hasExistingPositions={hasExistingPositions}
            currentEditValid={currentEditValid}
            isPending={isPending}
            onCancel={cancelEdit}
        />
    )

    const actionsDisabled = editingIndex !== null

    const positionsContent = hasExistingPositions ? (
        <PositionsTable
            positions={defaults.positions}
            editingIndex={editingIndex}
            form={form}
            canDelete={canDelete}
            actionsDisabled={actionsDisabled}
            readOnly={readOnly}
            formSlot={formFieldsElement}
            onEdit={openEdit}
            onDelete={handleDelete}
            onAdd={openAdd}
        />
    ) : (
        formFieldsElement
    )

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Current institutional information"
                isEditing={false}
                onEdit={() => {}}
                showEditButton={false}
            />

            {positionsContent}

            {formActionsElement}
        </Paper>
    )
}
