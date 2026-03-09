'use client'

import { Group, Stack, Title } from '@mantine/core'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { PersonalInfoSection } from '@/components/researcher-profile/personal-info-section'
import { EducationSection } from '@/components/researcher-profile/education-section'
import { PositionsSection } from '@/components/researcher-profile/positions-section'
import { ResearchDetailsSection } from '@/components/researcher-profile/research-details-section'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import type { OrgType } from '@/database/types'

interface ResearcherProfileViewProps {
    orgSlug: string
    studyId: string
    profileData: ResearcherProfileData
    orgType: OrgType
}

const noop = async () => {}

export function ResearcherProfileView({ orgSlug, studyId, profileData, orgType }: ResearcherProfileViewProps) {
    const studyParams = { orgSlug, studyId }
    const backHref = orgType === 'lab' ? Routes.studySubmitted(studyParams) : Routes.studyReview(studyParams)

    return (
        <Stack px="xl" gap="xl">
            <Link href={backHref} c="blue.7">
                <Group gap={4} display="inline-flex">
                    <ArrowLeftIcon size={16} />
                    Back to study proposal
                </Group>
            </Link>

            <Title order={2} size="h4" fw={500}>
                Researcher Profile
            </Title>

            <PersonalInfoSection data={profileData} refetch={noop} readOnly />
            <EducationSection data={profileData} refetch={noop} readOnly />
            <PositionsSection data={profileData} refetch={noop} readOnly />
            <ResearchDetailsSection data={profileData} refetch={noop} readOnly />
        </Stack>
    )
}
