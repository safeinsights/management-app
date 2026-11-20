'use client'

import { fontWeight, semanticColor } from '@/theme/tokens'
import type { ReactNode } from 'react'
import { Group, Title } from '@mantine/core'
import { Link } from '@/components/links'
import { Routes } from '@/lib/routes'
import { PersonalInfoSection } from '@/components/researcher-profile/personal-info-section'
import { EducationSection } from '@/components/researcher-profile/education-section'
import { PositionsSection } from '@/components/researcher-profile/positions-section'
import { ResearchDetailsSection } from '@/components/researcher-profile/research-details-section'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import type { OrgType } from '@/database/types'
import { PageLayout } from '@/components/page-layout'

interface ResearcherProfileViewProps {
    header: ReactNode
    orgSlug: string
    studyId: string
    profileData: ResearcherProfileData
    orgType: OrgType
}

export function ResearcherProfileView({ header, orgSlug, studyId, profileData, orgType }: ResearcherProfileViewProps) {
    const studyParams = { orgSlug, studyId }
    const backHref = orgType === 'lab' ? Routes.studySubmitted(studyParams) : Routes.studyReview(studyParams)

    return (
        <PageLayout header={header} gap="xl">
            <Link href={backHref} c={semanticColor('link.default')}>
                <Group gap="xxs" display="inline-flex">
                    <ArrowLeftIcon size={16} />
                    Back to study proposal
                </Group>
            </Link>

            <Title order={2} size="h4" fw={fontWeight.semibold}>
                Researcher Profile
            </Title>

            <PersonalInfoSection data={profileData} readOnly />
            <EducationSection data={profileData} readOnly />
            <PositionsSection data={profileData} readOnly />
            <ResearchDetailsSection data={profileData} readOnly />
        </PageLayout>
    )
}
