'use client'

import { useProfileSection } from '@/hooks/use-profile-section'
import { updatePositionsAction } from '@/server/actions/researcher-profile.actions'
import { positionsSchema, type PositionsValues, type PositionValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

const emptyPosition: PositionValues = { affiliation: '', position: '', profileUrl: '' }

const toPositionsDefaults = (data: ResearcherProfileData | null): PositionsValues => {
    const positions = (data?.positions ?? [])
        .map((p) => ({
            affiliation: p.affiliation,
            position: p.position,
            profileUrl: p.profileUrl ?? '',
        }))
        .filter((p) => p.affiliation || p.position || p.profileUrl)
    return { positions: positions.length > 0 ? positions : [emptyPosition] }
}

const hasPositions = ({ positions }: PositionsValues) => positions.some((p) => p.affiliation || p.position)

export function usePositionsSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const {
        form,
        defaults,
        editing: editingIndex,
        setEditing: setEditingIndex,
        isPending,
        submit,
    } = useProfileSection<PositionsValues, number>(data, refetch, {
        schema: positionsSchema,
        toDefaults: toPositionsDefaults,
        initialEditing: (values) => (hasPositions(values) ? null : 0),
        save: updatePositionsAction,
        successMessage: 'Current institutional information updated',
    })

    const openAdd = () => {
        form.insertListItem('positions', { ...emptyPosition })
        setEditingIndex(form.values.positions.length)
    }

    const cancelEdit = () => {
        if (editingIndex !== null) {
            const currentPos = form.values.positions[editingIndex]
            const isNewEmpty = !currentPos?.affiliation && !currentPos?.position && !currentPos?.profileUrl
            if (isNewEmpty && form.values.positions.length > 1) {
                form.removeListItem('positions', editingIndex)
            }
        }
        form.setValues(defaults)
        form.resetDirty(defaults)

        if (defaults.positions.length === 1 && !defaults.positions[0]?.affiliation) {
            setEditingIndex(0)
        } else {
            setEditingIndex(null)
        }
    }

    const handleSubmit = () => {
        if (editingIndex === null) return

        const values = form.values.positions[editingIndex]
        if (!values) return

        const cleaned: PositionValues = {
            affiliation: values.affiliation,
            position: values.position,
            profileUrl: values.profileUrl?.trim() ?? '',
        }

        submit({ positions: form.values.positions.map((pos, idx) => (idx === editingIndex ? cleaned : pos)) })
    }

    const handleDelete = (index: number) => {
        submit({ positions: form.values.positions.filter((_, i) => i !== index) })
    }

    return {
        form,
        editingIndex,
        defaults,
        isPending,
        hasExistingPositions: hasPositions(defaults),
        canDelete: defaults.positions.length >= 2,
        isAdding: editingIndex !== null && editingIndex >= defaults.positions.length,
        currentEditValid: editingIndex !== null && form.isValid(),
        openEdit: setEditingIndex,
        openAdd,
        cancelEdit,
        handleSubmit,
        handleDelete,
    }
}
