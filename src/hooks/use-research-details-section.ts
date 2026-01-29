'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updateResearchDetailsAction } from '@/server/actions/researcher-profile.actions'
import { researchDetailsSchema, type ResearchDetailsValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

export function useResearchDetailsSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [isEditing, setIsEditing] = useState(true)
    const [interestDraft, setInterestDraft] = useState('')

    const defaults: ResearchDetailsValues = useMemo(
        () => ({
            researchInterests: (data?.profile.researchInterests ?? []) as string[],
            detailedPublicationsUrl: data?.profile.detailedPublicationsUrl ?? '',
            featuredPublicationsUrls: [
                ((data?.profile.featuredPublicationsUrls as string[] | undefined)?.[0] ?? '') as string,
                ((data?.profile.featuredPublicationsUrls as string[] | undefined)?.[1] ?? '') as string,
            ],
        }),
        [
            data?.profile.researchInterests,
            data?.profile.detailedPublicationsUrl,
            data?.profile.featuredPublicationsUrls,
        ],
    )

    const form = useForm<ResearchDetailsValues>({
        mode: 'controlled',
        initialValues: defaults,
        validate: zodResolver(researchDetailsSchema),
        validateInputOnBlur: true,
    })

    useEffect(() => {
        form.setValues(defaults)
        form.resetDirty(defaults)
        if (data) {
            const complete = Boolean(defaults.researchInterests?.length) && Boolean(defaults.detailedPublicationsUrl)
            setIsEditing(!complete)
        }
        setInterestDraft('')
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [defaults.detailedPublicationsUrl, (defaults.researchInterests || []).join('|')])

    const saveMutation = useMutation({
        mutationFn: async (values: ResearchDetailsValues) => updateResearchDetailsAction(values),
        onSuccess: async () => {
            await refetch()
            setIsEditing(false)
            notifications.show({ title: 'Saved', message: 'Research details updated', color: 'green' })
        },
        onError: (error) => {
            notifications.show({ title: 'Save failed', message: String(error), color: 'red' })
        },
    })

    const addInterest = () => {
        const v = interestDraft.trim()
        if (!v) return

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

    const handleSubmit = (values: ResearchDetailsValues) => {
        const featured = (values.featuredPublicationsUrls || []).filter((v) => v && v.trim()).slice(0, 2)
        saveMutation.mutate({
            ...values,
            featuredPublicationsUrls: featured,
        })
    }

    return {
        form,
        isEditing,
        setIsEditing,
        defaults,
        isPending: saveMutation.isPending,
        interestDraft,
        setInterestDraft,
        addInterest,
        removeInterest,
        handleSubmit,
    }
}
