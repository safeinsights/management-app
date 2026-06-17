'use client'

import { useEducationSection } from '@/hooks/use-education-section'
import { EducationSectionView } from '@/components/researcher-profile/researcher-profile-view'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface EducationSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

export function EducationSection({ data, refetch, readOnly = false }: EducationSectionProps) {
    const { form, isEditing, setIsEditing, defaults, isPending, handleSubmit } = useEducationSection(data, refetch)

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
            onEdit={() => setIsEditing(true)}
            onSubmit={handleSubmit}
        />
    )
}
