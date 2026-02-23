'use client'

import { Anchor, Button, Group, Paper, Pill, Stack, Text, TextInput } from '@mantine/core'
import { useResearchDetailsSection } from '@/hooks/use-research-details-section'
import { SectionHeader } from '@/components/researcher-profile/section-header'
import { DisplayField } from '@/components/researcher-profile/display-field'
import { ResearchInterestsInput } from '@/components/researcher-profile/research-interests-input'
import { FormFieldLabel } from '@/components/form-field-label'
import type { ResearcherProfileData } from '@/hooks/use-researcher-profile'
import type { ResearchDetailsValues } from '@/schema/researcher-profile'
import type { UseFormReturnType } from '@mantine/form'

interface ResearchDetailsSectionProps {
    data: ResearcherProfileData | null
    refetch: () => Promise<unknown>
    readOnly?: boolean
}

interface ResearchDetailsEditFormProps {
    form: UseFormReturnType<ResearchDetailsValues>
    interestDraft: string
    isPending: boolean
    onInterestDraftChange: (value: string) => void
    onAddInterest: () => void
    onRemoveInterest: (index: number) => void
    onSubmit: (values: ResearchDetailsValues) => void
}

interface ResearchDetailsDisplayProps {
    defaults: ResearchDetailsValues
}

function ResearchDetailsEditForm({
    form,
    interestDraft,
    isPending,
    onInterestDraftChange,
    onAddInterest,
    onRemoveInterest,
    onSubmit,
}: ResearchDetailsEditFormProps) {
    return (
        <form onSubmit={form.onSubmit(onSubmit)}>
            <Stack gap="md">
                <div>
                    <FormFieldLabel label="Research interests" required inputId="researchInterests" />
                    <ResearchInterestsInput
                        form={form}
                        draftValue={interestDraft}
                        onDraftChange={onInterestDraftChange}
                        onAdd={onAddInterest}
                        onRemove={onRemoveInterest}
                    />
                </div>

                <div>
                    <FormFieldLabel label="Detailed publications URL" required inputId="detailedPublicationsUrl" />
                    <Text size="sm" mb={6}>
                        Provide a digital link where your complete and most recent publications are listed (e.g., Google
                        Scholar, LinkedIn, personal website, or resume).
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
                        Share the URL for two of your most relevant publications, if available. If you do not have any
                        publications yet, please share publications from your current research lab that closely
                        represent the work you want to do.
                    </Text>
                    <Stack gap="sm">
                        <TextInput
                            id="featured0"
                            placeholder="https://first-publication-link"
                            {...form.getInputProps('featuredPublicationsUrls.0')}
                        />
                        <TextInput
                            id="featured1"
                            placeholder="https://second-publication-link"
                            {...form.getInputProps('featuredPublicationsUrls.1')}
                        />
                    </Stack>
                </div>

                <Group justify="flex-end" mt="xl">
                    <Button type="submit" disabled={!form.isValid() || isPending} loading={isPending}>
                        Save changes
                    </Button>
                </Group>
            </Stack>
        </form>
    )
}

function ResearchDetailsDisplay({ defaults }: ResearchDetailsDisplayProps) {
    const interestPills = (defaults.researchInterests || []).map((item, idx) => (
        <Pill key={`${item}-${idx}`}>{item}</Pill>
    ))

    const featuredUrls = (defaults.featuredPublicationsUrls || []).filter((u) => u)
    const hasFeaturedUrls = featuredUrls.length > 0
    const featuredLinks = featuredUrls.map((u, idx) => (
        <Anchor key={idx} href={u} target="_blank">
            {u}
        </Anchor>
    ))

    return (
        <Stack gap="md">
            <DisplayField label="Research interests">
                <Group gap="xs" mt={6}>
                    {interestPills}
                </Group>
            </DisplayField>
            <DisplayField label="Detailed publications URL">
                <Anchor href={defaults.detailedPublicationsUrl} target="_blank">
                    {defaults.detailedPublicationsUrl}
                </Anchor>
            </DisplayField>
            {hasFeaturedUrls && (
                <DisplayField label="Featured publications URLs">
                    <Stack gap={4} mt={4}>
                        {featuredLinks}
                    </Stack>
                </DisplayField>
            )}
        </Stack>
    )
}

export function ResearchDetailsSection({ data, refetch, readOnly = false }: ResearchDetailsSectionProps) {
    const {
        form,
        isEditing,
        setIsEditing,
        defaults,
        isPending,
        interestDraft,
        setInterestDraft,
        addInterest,
        removeInterest,
        handleSubmit,
    } = useResearchDetailsSection(data, refetch)

    const hasData = Boolean(defaults.researchInterests?.length) || Boolean(defaults.detailedPublicationsUrl)

    if (readOnly && !hasData) return null

    const showEditForm = !readOnly && isEditing

    return (
        <Paper p="xl" radius="sm">
            <SectionHeader
                title="Research details"
                isEditing={isEditing}
                onEdit={() => setIsEditing(true)}
                showEditButton={!readOnly}
            />

            {showEditForm ? (
                <ResearchDetailsEditForm
                    form={form}
                    interestDraft={interestDraft}
                    isPending={isPending}
                    onInterestDraftChange={setInterestDraft}
                    onAddInterest={addInterest}
                    onRemoveInterest={removeInterest}
                    onSubmit={handleSubmit}
                />
            ) : (
                <ResearchDetailsDisplay defaults={defaults} />
            )}
        </Paper>
    )
}
