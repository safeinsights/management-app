'use client'

import { useState } from 'react'
import { useProfileSection } from '@/hooks/use-profile-section'
import { updateResearchDetailsAction } from '@/server/actions/researcher-profile.actions'
import { researchDetailsSchema, type ResearchDetailsValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

const toResearchDetailsDefaults = (data: ResearcherProfileData | null): ResearchDetailsValues => {
    const featured = data?.profile.featuredPublicationsUrls as string[] | undefined
    return {
        researchInterests: (data?.profile.researchInterests ?? []) as string[],
        detailedPublicationsUrl: data?.profile.detailedPublicationsUrl ?? '',
        featuredPublicationsUrls: [featured?.[0] ?? '', featured?.[1] ?? ''],
    }
}

const openWhenIncomplete = ({ researchInterests, detailedPublicationsUrl }: ResearchDetailsValues) =>
    researchInterests.length && detailedPublicationsUrl ? null : true

const saveResearchDetails = (values: ResearchDetailsValues) =>
    updateResearchDetailsAction({
        ...values,
        featuredPublicationsUrls: values.featuredPublicationsUrls.filter((v) => v && v.trim()).slice(0, 2),
    })

export function useResearchDetailsSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [interestDraft, setInterestDraft] = useState('')

    const { form, isEditing, setEditing, defaults, isPending, submit } = useProfileSection(data, refetch, {
        schema: researchDetailsSchema,
        toDefaults: toResearchDetailsDefaults,
        initialEditing: openWhenIncomplete,
        save: saveResearchDetails,
        successMessage: 'Research details updated',
    })

    const startEditing = () => {
        setInterestDraft('')
        setEditing(true)
    }

    const addInterest = () => {
        const v = interestDraft.trim()
        // Validated even when empty: this runs from blur, and skipping it meant an untouched
        // required field never surfaced an error (OTTER-647).
        if (!v) {
            form.validateField('researchInterests')
            return
        }

        const existing = form.values.researchInterests || []
        if (existing.length >= 5) return
        if (existing.some((x) => x.toLowerCase() === v.toLowerCase())) {
            setInterestDraft('')
            return
        }

        form.insertListItem('researchInterests', v)
        form.validateField('researchInterests')
        setInterestDraft('')
    }

    const removeInterest = (idx: number) => {
        form.removeListItem('researchInterests', idx)
        form.validateField('researchInterests')
    }

    // Folds in an interest typed but never committed with Enter, so it is not silently dropped.
    // insertListItem updates the ref synchronously, so validate/getValues below see it.
    const submitWithDraft = () => {
        addInterest()
        const { hasErrors } = form.validate()
        if (hasErrors) return
        submit(form.getValues())
    }

    return {
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
    }
}
