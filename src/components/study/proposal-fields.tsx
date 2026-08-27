'use client'

import type { FC } from 'react'
import { Box, Divider, Group, Stack, Text } from '@mantine/core'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { ProfessionalProfileLink } from '@/components/professional-profile-link'
import type { SelectedStudy } from '@/server/actions/study.actions'

export function LexicalProposalField({
    label,
    value,
    divider = 'subtle',
    size = 'sm',
}: {
    label: string
    value?: string | null
    divider?: 'subtle' | 'default' | 'none'
    size?: 'sm' | 'md'
}) {
    if (!value) return null

    return (
        <>
            {divider !== 'none' && <Divider color={divider === 'subtle' ? 'gray.1' : undefined} />}
            <Stack gap="xs">
                <Text fw={700} size="sm">
                    {label}
                </Text>
                <Text size={size} component="div">
                    <ReadOnlyLexicalContent value={value} />
                </Text>
            </Stack>
        </>
    )
}

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

    return (
        <Stack gap="xs">
            <Text fw={700} size="sm">
                Dataset(s) of interest
            </Text>
            <Group gap="md">
                {datasets.map((id) => (
                    <Box key={id} bg="grey.10" px="xs" py={2} style={{ borderRadius: 'var(--mantine-radius-sm)' }}>
                        <Text size={size} c="charcoal.9">
                            {nameMap[id] || id}
                        </Text>
                    </Box>
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
            <Stack gap="xs">
                <Text fw={700} size="sm">
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
        <Stack gap="xs">
            <Text fw={700} size="sm">
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
