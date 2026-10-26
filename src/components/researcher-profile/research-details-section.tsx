'use client'

import { useResearchDetailsSection } from '@/components/researcher-profile/use-research-details-section'
import { ResearchDetailsSectionView } from '@/components/researcher-profile/researcher-profile-view'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface ResearchDetailsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

export function ResearchDetailsSection({ data, refetch, readOnly = false }: ResearchDetailsSectionProps) {
    const {
        form,
        isEditing,
        startEditing,
        defaults,
        isPending,
        interestDraft,
        setInterestDraft,
        addInterest,
        removeInterest,
        submitWithDraft,
    } = useResearchDetailsSection(data, refetch)

    const hasData = Boolean(defaults.researchInterests?.length) || Boolean(defaults.detailedPublicationsUrl)

    if (readOnly && !hasData) return null

    return (
        <ResearchDetailsSectionView
            form={form}
            defaults={defaults}
            isEditing={!readOnly && isEditing}
            isPending={isPending}
            interestDraft={interestDraft}
            showEditButton={!readOnly}
            onEdit={startEditing}
            onInterestDraftChange={setInterestDraft}
            onAddInterest={addInterest}
            onRemoveInterest={removeInterest}
            onSubmit={submitWithDraft}
        />
    )
}
