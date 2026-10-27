'use client'

import { useProfileSection } from '@/hooks/use-profile-section'
import { PersonalInfoSectionView } from '@/components/researcher-profile/researcher-profile-view'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import { updatePersonalInfoAction } from '@/server/actions/researcher-profile.actions'
import { personalInfoSchema, type PersonalInfoValues } from '@/schema/researcher-profile'

interface PersonalInfoSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

const toPersonalInfoDefaults = (data: ResearcherProfileData | null): PersonalInfoValues => ({
    firstName: data?.user.firstName ?? '',
    lastName: data?.user.lastName ?? '',
})

const openWhenIncomplete = ({ firstName, lastName }: PersonalInfoValues) => (firstName && lastName ? null : true)

export function PersonalInfoSection({ data, refetch, readOnly = false }: PersonalInfoSectionProps) {
    const { form, isEditing, setEditing, isPending, submit } = useProfileSection(data, refetch, {
        schema: personalInfoSchema,
        toDefaults: toPersonalInfoDefaults,
        initialEditing: openWhenIncomplete,
        save: updatePersonalInfoAction,
        successMessage: 'Personal information updated',
        skipUnchanged: true,
    })

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
            onEdit={() => setEditing(true)}
            onSubmit={submit}
        />
    )
}
