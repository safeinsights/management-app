'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useForm, zodResolver } from '@/common'
import { Anchor, Button, Group, Paper, Pill, PillsInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { updateResearchDetailsAction } from '@/server/actions/researcher-profile.actions'
import { researchDetailsSchema, type ResearchDetailsValues } from '@/schema/researcher-profile'
import { FormFieldLabel } from '@/components/form-field-label'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'

interface ResearchDetailsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
}

export function ResearchDetailsSection({ data, refetch }: ResearchDetailsSectionProps) {
    const [isEditing, setIsEditing] = useState(true)
    const [interestDraft, setInterestDraft] = useState('')

    const defaults: ResearchDetailsValues = useMemo(
        () => ({
            researchInterests: (data?.profile.researchInterests ?? []) as string[],
            detailedPublicationsUrl: data?.profile.detailedPublicationsUrl ?? '',
            featuredPublicationsUrls: ((data?.profile.featuredPublicationsUrls ?? []) as string[]).slice(0, 2),
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
        const complete = Boolean(defaults.researchInterests?.length) && Boolean(defaults.detailedPublicationsUrl)
        setIsEditing(!complete)
        setInterestDraft('')
        // eslint-disable-next-line react-hooks/exhaustive-deps -- tie to computed defaults
    }, [defaults.detailedPublicationsUrl, (defaults.researchInterests || []).join('|')])

    useEffect(() => {
        form.validate()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once
    }, [])

    const saveMutation = useMutation({
        mutationFn: async (values: ResearchDetailsValues) => updateResearchDetailsAction(values),
        onSuccess: async (res) => {
            if (res && 'error' in res) {
                notifications.show({ title: 'Save failed', message: String(res.error), color: 'red' })
                return
            }
            await refetch()
            setIsEditing(false)
            notifications.show({ title: 'Saved', message: 'Research details updated', color: 'green' })
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

        form.setFieldValue('researchInterests', [...existing, v])
        form.validateField('researchInterests')
        setInterestDraft('')
    }

    const removeInterest = (idx: number) => {
        const next = [...(form.values.researchInterests || [])]
        next.splice(idx, 1)
        form.setFieldValue('researchInterests', next)
        form.validateField('researchInterests')
    }

    const handleSubmit = (values: ResearchDetailsValues) => {
        const featured = (values.featuredPublicationsUrls || []).filter((v) => v && v.trim()).slice(0, 2)
        saveMutation.mutate({
            ...values,
            featuredPublicationsUrls: featured,
        })
    }

    return (
        <Paper p="xl" radius="sm">
            <Group justify="space-between" align="center" mb="md">
                <Title order={3}>Research details</Title>
                {!isEditing && (
                    <Button variant="subtle" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                )}
            </Group>

            {isEditing ? (
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack gap="md">
                        <div>
                            <FormFieldLabel label="Research interests" required inputId="researchInterests" />
                            <PillsInput
                                id="researchInterests"
                                error={form.errors.researchInterests as unknown as string}
                            >
                                <Pill.Group>
                                    {(form.values.researchInterests || []).map((item, idx) => (
                                        <Pill
                                            key={`${item}-${idx}`}
                                            withRemoveButton
                                            onRemove={() => removeInterest(idx)}
                                        >
                                            {item}
                                        </Pill>
                                    ))}
                                    <PillsInput.Field
                                        placeholder="Type a research interest and press enter"
                                        value={interestDraft}
                                        onChange={(e) => setInterestDraft(e.currentTarget.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault()
                                                addInterest()
                                            }
                                        }}
                                        disabled={(form.values.researchInterests || []).length >= 5}
                                    />
                                </Pill.Group>
                            </PillsInput>
                            <Text size="sm" mt={4}>
                                Include up to five area(s) of research interest.
                            </Text>
                        </div>

                        <div>
                            <FormFieldLabel
                                label="Detailed publications URL"
                                required
                                inputId="detailedPublicationsUrl"
                            />
                            <Text size="sm" mb={6}>
                                Provide a digital link where your complete and most recent publications are listed
                                (e.g., Google Scholar, LinkedIn, personal website, or resume).
                            </Text>
                            <TextInput
                                id="detailedPublicationsUrl"
                                placeholder="https://scholar.google.com/user..."
                                {...form.getInputProps('detailedPublicationsUrl')}
                            />
                        </div>

                        <div>
                            <FormFieldLabel label="Featured publications URLs" inputId="featured0" />
                            <Text size="sm" mb={6}>
                                Share the URL for two of your most relevant publications, if available. If you do not
                                have any publications yet, please share publications from your current research lab that
                                closely represent the work you want to do.
                            </Text>
                            <Stack gap="sm">
                                <TextInput
                                    id="featured0"
                                    placeholder="https://first-publication-link"
                                    value={form.values.featuredPublicationsUrls?.[0] ?? ''}
                                    onChange={(e) =>
                                        form.setFieldValue('featuredPublicationsUrls', [
                                            e.currentTarget.value,
                                            form.values.featuredPublicationsUrls?.[1] ?? '',
                                        ])
                                    }
                                    error={
                                        (form.errors.featuredPublicationsUrls as unknown as string[] | undefined)?.[0]
                                    }
                                />
                                <TextInput
                                    id="featured1"
                                    placeholder="https://second-publication-link"
                                    value={form.values.featuredPublicationsUrls?.[1] ?? ''}
                                    onChange={(e) =>
                                        form.setFieldValue('featuredPublicationsUrls', [
                                            form.values.featuredPublicationsUrls?.[0] ?? '',
                                            e.currentTarget.value,
                                        ])
                                    }
                                    error={
                                        (form.errors.featuredPublicationsUrls as unknown as string[] | undefined)?.[1]
                                    }
                                />
                            </Stack>
                        </div>

                        <Group justify="flex-end" mt="xl">
                            <Button
                                type="submit"
                                disabled={!form.isValid() || saveMutation.isPending}
                                loading={saveMutation.isPending}
                            >
                                Save changes
                            </Button>
                        </Group>
                    </Stack>
                </form>
            ) : (
                <Stack gap="sm">
                    <div>
                        <Text fw={600} size="sm">
                            Research interests
                        </Text>
                        <Group gap="xs" mt={6}>
                            {(defaults.researchInterests || []).map((item, idx) => (
                                <Pill key={`${item}-${idx}`}>{item}</Pill>
                            ))}
                        </Group>
                    </div>
                    <div>
                        <Text fw={600} size="sm">
                            Detailed publications URL
                        </Text>
                        <Anchor href={defaults.detailedPublicationsUrl} target="_blank">
                            {defaults.detailedPublicationsUrl}
                        </Anchor>
                    </div>
                    {defaults.featuredPublicationsUrls?.length ? (
                        <div>
                            <Text fw={600} size="sm">
                                Featured publications URLs
                            </Text>
                            <Stack gap={4} mt={4}>
                                {defaults.featuredPublicationsUrls.map((u, idx) => (
                                    <Anchor key={idx} href={u} target="_blank">
                                        {u}
                                    </Anchor>
                                ))}
                            </Stack>
                        </div>
                    ) : null}
                </Stack>
            )}
        </Paper>
    )
}
