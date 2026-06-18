'use client'

import { useResearcherProfile } from '@/hooks/use-researcher-profile'
import {
    PersonalInfoSection,
    EducationSection,
    PositionsSection,
    ResearchDetailsSection,
} from '@/components/researcher-profile'
import { ResearcherProfileLayout } from '@/components/researcher-profile/researcher-profile-view'

export default function ResearcherProfilePage() {
    const { data, refetch } = useResearcherProfile()

    return (
        <ResearcherProfileLayout>
            <PersonalInfoSection data={data} refetch={refetch} />

            <EducationSection data={data} refetch={refetch} />

            <PositionsSection data={data} refetch={refetch} />

            <ResearchDetailsSection data={data} refetch={refetch} />
        </ResearcherProfileLayout>
    )
}
