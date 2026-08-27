'use client'

import type { FC } from 'react'
import { Box, Divider, Group, Stack, Text } from '@mantine/core'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { ProfessionalProfileLink } from '@/components/professional-profile-link'
import type { SelectedStudy } from '@/server/actions/study.actions'

type FieldDividerVariant = 'subtle' | 'default' | 'none'

const FieldDivider: FC<{ variant: FieldDividerVariant }> = ({ variant }) => {
    if (variant === 'none') return null

    // A default Divider between two fields, a lighter one where the field leads a group.
    const color = variant === 'subtle' ? 'gray.1' : undefined
    return <Divider color={color} />
}

export function LexicalProposalField({
    label,
    value,
    divider = 'subtle',
    size = 'sm',
}: {
    label: string
    value?: string | null
    divider?: FieldDividerVariant
    size?: 'sm' | 'md'
}) {
    if (!value) return null

    return (
        <>
            <FieldDivider variant={divider} />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    {label}
                </Text>
                <Text size={size} component="div">
                    <ReadOnlyLexicalContent value={value} />
                </Text>
            </Stack>
        </>
    )
}

const DatasetPill: FC<{ name: string; size: 'sm' | 'md' }> = ({ name, size }) => (
    <Box bg="grey.10" px="xs" py={2} bdrs="sm">
        <Text size={size} c="charcoal.9">
            {name}
        </Text>
    </Box>
)

export function DatasetsField({
    datasets,
    orgDataSources,
    size = 'sm',
}: {
    datasets: string[]
    orgDataSources: Array<{ id: string; name: string }>
    size?: 'sm' | 'md'
}) {
    if (!datasets.length) return null

    const nameMap = Object.fromEntries(orgDataSources.map((ds) => [ds.id, ds.name]))
    // The id stands in for a data source the org no longer lists, which is still worth showing.
    const named = datasets.map((id) => ({ id, name: nameMap[id] || id }))

    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Dataset(s) of interest
            </Text>
            <Group gap="md">
                {named.map(({ id, name }) => (
                    <DatasetPill key={id} name={name} size={size} />
                ))}
            </Group>
        </Stack>
    )
}

interface ProfileFieldProps {
    study: SelectedStudy
    orgSlug: string
    size?: 'sm' | 'md'
}

const ProfileRow: FC<{
    name: string
    userId?: string | null
    studyId: string
    orgSlug: string
    size?: 'sm' | 'md'
}> = ({ name, userId, studyId, orgSlug, size = 'md' }) => (
    <Group gap="md" align="center">
        <Text size={size} c="charcoal.7">
            {name}
        </Text>
        <ProfessionalProfileLink userId={userId} studyId={studyId} orgSlug={orgSlug} />
    </Group>
)

export function PIField({ study, orgSlug, size }: ProfileFieldProps) {
    if (!study.piName) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Principal Investigator
                </Text>
                <ProfileRow
                    name={study.piName}
                    userId={study.piUserId}
                    studyId={study.id}
                    orgSlug={orgSlug}
                    size={size}
                />
            </Stack>
        </>
    )
}

export function ResearcherField({ study, orgSlug, size }: ProfileFieldProps) {
    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Researcher
            </Text>
            <ProfileRow
                name={study.createdBy}
                userId={study.researcherId}
                studyId={study.id}
                orgSlug={orgSlug}
                size={size}
            />
        </Stack>
    )
}
