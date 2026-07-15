'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updateEducationAction } from '@/server/actions/researcher-profile.actions'
import { educationSchema, type EducationValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

export function useEducationSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [isEditing, setIsEditing] = useState(false)
    const [autoOpenKey, setAutoOpenKey] = useState<string | null>(null)

    const defaults: EducationValues = useMemo(
        () => ({
            educationalInstitution: data?.profile.educationInstitution ?? '',
            degree: data?.profile.educationDegree ?? '',
            fieldOfStudy: data?.profile.educationFieldOfStudy ?? '',
            isCurrentlyPursuing: Boolean(data?.profile.educationIsCurrentlyPursuing ?? false),
        }),
        [
            data?.profile.educationInstitution,
            data?.profile.educationDegree,
            data?.profile.educationFieldOfStudy,
            data?.profile.educationIsCurrentlyPursuing,
        ],
    )

    const form = useForm<EducationValues>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(educationSchema),
        validateInputOnBlur: true,
    })

    // Reflect the persisted values into the form when they change, but never while the
    // user has unsaved edits open: a background refetch (15-min interval / window focus)
    // can change `data` mid-edit, and resetting the form would silently discard the edit.
    // When not editing (or editing with no changes yet) this still populates the form,
    // including the auto-opened incomplete-profile case below.
    useEffect(() => {
        if (isEditing && form.isDirty()) return
        form.setValues(defaults)
        form.resetDirty(defaults)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when persisted values change
    }, [defaults])

    // Open straight into edit mode for an incomplete profile. Derived during render
    // (keyed on the persisted values) instead of in an effect to avoid a cascading
    // set-state-in-effect; the effect above still populates the form either way.
    if (data) {
        const key = JSON.stringify([defaults.educationalInstitution, defaults.degree, defaults.fieldOfStudy])
        if (key !== autoOpenKey) {
            setAutoOpenKey(key)
            const complete =
                Boolean(defaults.educationalInstitution) && Boolean(defaults.degree) && Boolean(defaults.fieldOfStudy)
            if (!isEditing && !complete) {
                setIsEditing(true)
            }
        }
    }

    const saveMutation = useMutation({
        mutationFn: async (values: EducationValues) => updateEducationAction(values),
        onSuccess: async () => {
            await refetch()
            setIsEditing(false)
            notifications.show({ title: 'Saved', message: 'Education updated', color: 'green' })
        },
        onError: (error) => {
            notifications.show({ title: 'Save failed', message: String(error), color: 'red' })
        },
    })

    const handleSubmit = (values: EducationValues) => {
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
