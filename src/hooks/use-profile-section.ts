'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { reportMutationError } from '@/components/errors'
import { showToast } from '@/components/toast-notifications'
import { useForm, useMutation, zodResolver, type ActionResponse, type z } from '@/common'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface ProfileSectionConfig<V, E> {
    schema: z.ZodType<V>
    toDefaults: (data: ResearcherProfileData | null) => V
    // What edit state a section opens in when server data arrives; null keeps it closed.
    initialEditing: (defaults: V) => E | null
    save: (values: V) => Promise<ActionResponse<unknown>>
    successMessage: string
    skipUnchanged?: boolean
}

// `editing` is the section's edit state: `true` for single-form sections, the row index for list sections.
export function useProfileSection<V extends Record<string, unknown>, E = true>(
    data: ResearcherProfileData | null,
    refetch: () => Promise<unknown>,
    { schema, toDefaults, initialEditing, save, successMessage, skipUnchanged = false }: ProfileSectionConfig<V, E>,
) {
    const [editing, setEditing] = useState<E | null>(null)
    const [seed, setSeed] = useState<{ key: string; reseed: boolean } | null>(null)

    const defaults = toDefaults(data)
    const defaultsKey = JSON.stringify(defaults)

    const form = useForm<V>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(schema),
    })

    // Server data only replaces the form while it is closed, so a background refetch cannot
    // overwrite unsaved input. Decided at render so auto-open cannot block its own seeding.
    if (data && seed?.key !== defaultsKey) {
        const reseed = editing === null
        setSeed({ key: defaultsKey, reseed })
        if (reseed) setEditing(initialEditing(defaults))
    }

    const applyDefaults = useEffectEvent(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
    })

    useEffect(() => {
        if (seed?.reseed) applyDefaults()
    }, [seed])

    const saveMutation = useMutation({
        mutationFn: save,
        onSuccess: async () => {
            await refetch()
            setEditing(null)
            showToast({ category: 'success', title: 'Saved', message: successMessage })
        },
        onError: reportMutationError('Save failed'),
    })

    const submit = (values: V) => {
        if (skipUnchanged && !form.isDirty()) {
            setEditing(null)
            return
        }
        saveMutation.mutate(values)
    }

    return {
        form,
        defaults,
        editing,
        setEditing,
        isEditing: editing !== null,
        isPending: saveMutation.isPending,
        submit,
    }
}
