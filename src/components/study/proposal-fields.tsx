'use client'

import type { FC } from 'react'
import { Box, Divider, Group, Stack, Text } from '@mantine/core'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { ProfessionalProfileLink } from '@/components/professional-profile-link'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { datasetDisplayNames } from '@/lib/studies'
import { fontWeight, semanticColor } from '@/theme/tokens'

export type FieldDividerVariant = 'subtle' | 'default' | 'none'

/** A `variant` of `none` renders nothing. */
export const FieldDivider: FC<{ variant: FieldDividerVariant }> = ({ variant }) => {
    if (variant === 'none') return null

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
            <Stack gap="xxs">
                <Text fw={fontWeight.semibold} size="sm">
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
    <Box bg={semanticColor('surface.page')} px="xs" py={2} bdrs="sm">
        <Text size={size} c={semanticColor('text.primary')}>
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

    const names = datasetDisplayNames(datasets, orgDataSources)
    const named = datasets.map((id, index) => ({ id, name: names[index] }))

    return (
        <Stack gap="xxs">
            <Text fw={fontWeight.semibold} size="sm">
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
        <Text size={size} c={semanticColor('text.secondary')}>
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
            <Stack gap="xxs">
                <Text fw={fontWeight.semibold} size="sm">
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
        <Stack gap="xxs">
            <Text fw={fontWeight.semibold} size="sm">
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
