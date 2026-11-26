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
    const { data } = useResearcherProfile()

    return (
        <ResearcherProfileLayout>
            <PersonalInfoSection data={data} />

            <EducationSection data={data} />

            <PositionsSection data={data} />

            <ResearchDetailsSection data={data} />
        </ResearcherProfileLayout>
    )
}
