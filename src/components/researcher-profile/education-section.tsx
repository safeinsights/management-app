'use client'

import { useProfileSection } from '@/hooks/use-profile-section'
import { EducationSectionView } from '@/components/researcher-profile/researcher-profile-view'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import { updateEducationAction } from '@/server/actions/researcher-profile.actions'
import { educationSchema, type EducationValues } from '@/schema/researcher-profile'

interface EducationSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

const toEducationDefaults = (data: ResearcherProfileData | null): EducationValues => ({
    educationalInstitution: data?.profile.educationInstitution ?? '',
    degree: data?.profile.educationDegree ?? '',
    fieldOfStudy: data?.profile.educationFieldOfStudy ?? '',
    isCurrentlyPursuing: Boolean(data?.profile.educationIsCurrentlyPursuing ?? false),
})

const openWhenIncomplete = ({ educationalInstitution, degree, fieldOfStudy }: EducationValues) =>
    educationalInstitution && degree && fieldOfStudy ? null : true

export function EducationSection({ data, refetch, readOnly = false }: EducationSectionProps) {
    const { form, isEditing, setEditing, defaults, isPending, submit } = useProfileSection(data, refetch, {
        schema: educationSchema,
        toDefaults: toEducationDefaults,
        initialEditing: openWhenIncomplete,
        save: updateEducationAction,
        successMessage: 'Education updated',
    })

    const hasData =
        Boolean(defaults.educationalInstitution) || Boolean(defaults.degree) || Boolean(defaults.fieldOfStudy)

    if (readOnly && !hasData) return null

    return (
        <EducationSectionView
            form={form}
            defaults={defaults}
            isEditing={!readOnly && isEditing}
            isPending={isPending}
            showEditButton={!readOnly}
            onEdit={() => setEditing(true)}
            onSubmit={submit}
        />
    )
}
