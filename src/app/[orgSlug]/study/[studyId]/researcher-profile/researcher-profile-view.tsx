'use client'

import { Stack, Title } from '@mantine/core'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { PersonalInfoSection } from '@/components/researcher-profile/personal-info-section'
import { EducationSection } from '@/components/researcher-profile/education-section'
import { PositionsSection } from '@/components/researcher-profile/positions-section'
import { ResearchDetailsSection } from '@/components/researcher-profile/research-details-section'
import { ArrowLeft } from '@phosphor-icons/react'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface ResearcherProfileViewProps {
    orgSlug: string
    studyId: string
    profileData: ResearcherProfileData
}

const noop = async () => {}

export function ResearcherProfileView({ orgSlug, studyId, profileData }: ResearcherProfileViewProps) {
    return (
        <Stack px="xl" gap="xl">
            <Link
                href={Routes.studyReview({ orgSlug, studyId })}
                c="blue.7"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
                <ArrowLeft size={16} />
                Back to study proposal
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
