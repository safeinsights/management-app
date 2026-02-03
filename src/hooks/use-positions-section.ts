'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updatePositionsAction } from '@/server/actions/researcher-profile.actions'
import { positionsSchema, type PositionsValues, type PositionValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

const emptyPosition: PositionValues = { affiliation: '', position: '', profileUrl: '' }

export function usePositionsSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null)

    const defaults: PositionsValues = useMemo(() => {
        const raw = (data?.profile.positions ?? []) as unknown
        if (Array.isArray(raw)) {
            const positions = raw
                .map((p) => {
                    const obj = p as Record<string, unknown>
                    return {
                        affiliation: String(obj.affiliation ?? ''),
                        position: String(obj.position ?? ''),
                        profileUrl: obj.profileUrl ? String(obj.profileUrl) : '',
                    }
                })
                .filter((p) => p.affiliation || p.position || p.profileUrl)
            return { positions: positions.length > 0 ? positions : [emptyPosition] }
        }
        return { positions: [emptyPosition] }
    }, [data?.profile.positions])

    const form = useForm<PositionsValues>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(positionsSchema),
        validateInputOnBlur: true,
    })

    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [JSON.stringify(defaults.positions)])

    const hasExistingPositions = defaults.positions.some((p) => p.affiliation || p.position)

    // Auto-open form when there are no existing positions (only after data loads)
    useEffect(() => {
        if (data && !hasExistingPositions && editingIndex === null) {
            setEditingIndex(0)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when data or hasExistingPositions changes, not editingIndex
    }, [data, hasExistingPositions])

    const saveMutation = useMutation({
        mutationFn: async (positionsToSave: PositionValues[]) => updatePositionsAction({ positions: positionsToSave }),
        onSuccess: async () => {
            await refetch()
            setEditingIndex(null)
            notifications.show({ title: 'Saved', message: 'Current institutional information updated', color: 'green' })
        },
        onError: (error) => {
            notifications.show({ title: 'Save failed', message: String(error), color: 'red' })
        },
    })

    const openEdit = (index: number) => {
        setEditingIndex(index)
    }

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

        const next = form.values.positions.map((pos, idx) => (idx === editingIndex ? cleaned : pos))
        saveMutation.mutate(next)
    }

    const handleDelete = (index: number) => {
        const next = form.values.positions.filter((_, i) => i !== index)
        saveMutation.mutate(next)
    }

    const showForm = editingIndex !== null || !hasExistingPositions
    const isAdding = editingIndex !== null && editingIndex >= defaults.positions.length
    const currentEditValid =
        editingIndex !== null &&
        Boolean(form.values.positions[editingIndex]?.affiliation) &&
        Boolean(form.values.positions[editingIndex]?.position)

    return {
        form,
        editingIndex,
        defaults,
        isPending: saveMutation.isPending,
        hasExistingPositions,
        showForm,
        isAdding,
        currentEditValid,
        openEdit,
        openAdd,
        cancelEdit,
        handleSubmit,
        handleDelete,
    }
}
