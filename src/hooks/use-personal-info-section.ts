'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updatePersonalInfoAction } from '@/server/actions/researcher-profile.actions'
import { personalInfoSchema, type PersonalInfoValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

export function usePersonalInfoSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [isEditing, setIsEditing] = useState(false)

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

    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        if (data) {
            const complete = Boolean(defaults.firstName) && Boolean(defaults.lastName)
            setIsEditing(!complete)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [data, defaults.firstName, defaults.lastName])

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
