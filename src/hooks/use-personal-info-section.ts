'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updatePersonalInfoAction } from '@/server/actions/researcher-profile.actions'
import { personalInfoSchema, type PersonalInfoValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

export function usePersonalInfoSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [isEditing, setIsEditing] = useState(false)
    const [autoOpenKey, setAutoOpenKey] = useState<string | null>(null)

    const defaults: PersonalInfoValues = useMemo(
        () => ({
            firstName: data?.user.firstName ?? '',
            lastName: data?.user.lastName ?? '',
        }),
        [data?.user.firstName, data?.user.lastName],
    )

    const form = useForm<PersonalInfoValues>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(personalInfoSchema),
        validateInputOnBlur: true,
    })

    // Reflect the persisted values into the form whenever they change. `defaults` is
    // memoized on the underlying field values, so this only re-runs on a real change
    // and never clobbers in-progress edits (typing doesn't change `data`).
    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when persisted values change
    }, [defaults])

    // Open straight into edit mode for an incomplete profile. Derived during render
    // (keyed on the persisted values) instead of in an effect to avoid a cascading
    // set-state-in-effect; the effect above still populates the form either way.
    if (data) {
        const key = JSON.stringify([defaults.firstName, defaults.lastName])
        if (key !== autoOpenKey) {
            setAutoOpenKey(key)
            if (!isEditing && !(Boolean(defaults.firstName) && Boolean(defaults.lastName))) {
                setIsEditing(true)
            }
        }
    }

    const saveMutation = useMutation({
        mutationFn: async (values: PersonalInfoValues) => updatePersonalInfoAction(values),
        onSuccess: async () => {
            await refetch()
            setIsEditing(false)
            notifications.show({ title: 'Saved', message: 'Personal information updated', color: 'green' })
        },
        onError: (error) => {
            notifications.show({ title: 'Save failed', message: String(error), color: 'red' })
        },
    })

    const handleSubmit = (values: PersonalInfoValues) => {
        if (!form.isDirty()) {
            setIsEditing(false)
            return
        }
        saveMutation.mutate(values)
    }

    return {
        form,
        isEditing,
        setIsEditing,
        defaults,
        isPending: saveMutation.isPending,
        handleSubmit,
    }
}
