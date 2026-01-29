'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updateEducationAction } from '@/server/actions/researcher-profile.actions'
import { educationSchema, type EducationValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

export function useEducationSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [isEditing, setIsEditing] = useState(true)

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

    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        if (data) {
            const complete =
                Boolean(defaults.educationalInstitution) && Boolean(defaults.degree) && Boolean(defaults.fieldOfStudy)
            setIsEditing(!complete)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [defaults.educationalInstitution, defaults.degree, defaults.fieldOfStudy])

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
