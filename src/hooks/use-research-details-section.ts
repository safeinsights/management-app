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
    const [autoOpenKey, setAutoOpenKey] = useState<string | null>(null)

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

    // Reflect the persisted values into the form when they change, but never while the
    // user has unsaved input open: a background refetch (15-min interval / window focus)
    // can change `data` mid-edit, and resetting the form would silently discard it.
    // "Unsaved input" is both dirty form fields and a typed-but-uncommitted interest
    // draft (separate state that form.isDirty() does not track). When not editing (or
    // editing with nothing entered yet) this still populates the form, including the
    // auto-opened incomplete-profile case below.
    useEffect(() => {
        if (isEditing && (form.isDirty() || interestDraft.trim().length > 0)) return
        form.setValues(defaults)
        form.resetDirty(defaults)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- resync only when persisted values change
    }, [defaults])

    // Open straight into edit mode for an incomplete profile and clear any stale
    // interest draft. Derived during render (keyed on the persisted values) instead
    // of in an effect to avoid a cascading set-state-in-effect; the effect above
    // still populates the form either way. Gated on !isEditing so a mid-edit refetch
    // cannot clear an interest the user has typed but not yet committed.
    if (data && !isEditing) {
        const key = JSON.stringify([defaults.detailedPublicationsUrl, defaults.researchInterests ?? []])
        if (key !== autoOpenKey) {
            setAutoOpenKey(key)
            setInterestDraft('')
            const complete = Boolean(defaults.researchInterests?.length) && Boolean(defaults.detailedPublicationsUrl)
            if (!complete) {
                setIsEditing(true)
            }
        }
    }

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
