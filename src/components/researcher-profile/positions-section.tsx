'use client'

import { usePositionsSection } from '@/hooks/use-positions-section'
import { PositionsSectionView } from '@/components/researcher-profile/researcher-profile-view'
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

    if (readOnly && !hasExistingPositions) return null

    return (
        <PositionsSectionView
            form={form}
            defaults={defaults}
            editingIndex={editingIndex}
            isPending={isPending}
            hasExistingPositions={hasExistingPositions}
            canDelete={canDelete}
            isAdding={isAdding}
            currentEditValid={currentEditValid}
            readOnly={readOnly}
            onEdit={openEdit}
            onAdd={openAdd}
            onCancel={cancelEdit}
            onSubmit={handleSubmit}
            onDelete={handleDelete}
        />
    )
}
