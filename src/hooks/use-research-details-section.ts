'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { notifications } from '@mantine/notifications'
import { updateResearchDetailsAction } from '@/server/actions/researcher-profile.actions'
import { researchDetailsSchema, type ResearchDetailsValues } from '@/schema/researcher-profile'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

export function useResearchDetailsSection(data: ResearcherProfileData | null, refetch: () => Promise<unknown>) {
    const [isEditing, setIsEditing] = useState(false)
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

    // Seed the form from the persisted profile, decide the initial edit mode, and clear any
    // stale interest draft, but never while the user is editing, so a background refetch
    // (15-min interval / window focus) can never overwrite unsaved input. Seeding the form
    // (an external Mantine store) and the coupled edit-mode / draft resets must run together
    // in this effect: they have to happen in the same pass so the form is populated before it
    // opens, and "not editing" is the only reliable divergence guard. form.isDirty() is not
    // dependable here: committed interest edits go through Mantine list ops and an uncommitted
    // draft is separate state, so neither reliably marks the form dirty.
    useEffect(() => {
        if (isEditing) return
        form.setValues(defaults)
        form.resetDirty(defaults)
        if (data) {
            const complete = Boolean(defaults.researchInterests?.length) && Boolean(defaults.detailedPublicationsUrl)
            // eslint-disable-next-line react-hooks/set-state-in-effect -- initial edit mode is coupled to seeding the form from server data
            setIsEditing(!complete)
        }
        setInterestDraft('')
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [data, defaults.detailedPublicationsUrl, (defaults.researchInterests || []).join('|')])

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

    // Folds any interest the user typed but never committed with Enter into the form
    // value before validating, so a visible-but-uncommitted interest is not silently
    // dropped and does not leave the user with a permanently disabled Save button.
    // insertListItem updates the ref synchronously, so form.validate/getValues below
    // see the just-added interest even in controlled mode.
    const submitWithDraft = () => {
        addInterest()
        const { hasErrors } = form.validate()
        if (hasErrors) return
        handleSubmit(form.getValues())
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
        submitWithDraft,
    }
}
