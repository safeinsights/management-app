'use client'

import { usePersonalInfoSection } from '@/hooks/use-personal-info-section'
import { PersonalInfoSectionView } from '@/components/researcher-profile/researcher-profile-view'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface PersonalInfoSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

export function PersonalInfoSection({ data, refetch, readOnly = false }: PersonalInfoSectionProps) {
    const { form, isEditing, setIsEditing, isPending, handleSubmit } = usePersonalInfoSection(data, refetch)

    const email = data?.user.email ?? ''
    const firstName = data?.user.firstName ?? ''
    const lastName = data?.user.lastName ?? ''

    return (
        <PersonalInfoSectionView
            form={form}
            firstName={firstName}
            lastName={lastName}
            email={email}
            isEditing={!readOnly && isEditing}
            isPending={isPending}
            showEditButton={!readOnly}
            onEdit={() => setIsEditing(true)}
            onSubmit={handleSubmit}
        />
    )
}
