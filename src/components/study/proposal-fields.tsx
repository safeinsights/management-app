'use client'

import { Divider, Stack, Text } from '@mantine/core'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { ResearcherProfilePopover } from '@/components/researcher-profile-popover'
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
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Dataset(s) of interest
            </Text>
            <Text size={size}>{datasets.map((id) => nameMap[id] || id).join(', ')}</Text>
        </Stack>
    )
}

interface PopoverFieldProps {
    study: SelectedStudy
    orgSlug: string
    opened: boolean
    onOpenChange: (opened: boolean) => void
    size?: 'sm' | 'md'
}

export function PIField({ study, orgSlug, opened, onOpenChange, size }: PopoverFieldProps) {
    if (!study.piUserId) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Principal Investigator
                </Text>
                <ResearcherProfilePopover
                    userId={study.piUserId}
                    studyId={study.id}
                    orgSlug={orgSlug}
                    name={study.piName}
                    size={size}
                    position="right"
                    offset={8}
                    arrowSize={12}
                    opened={opened}
                    onOpenChange={onOpenChange}
                />
            </Stack>
        </>
    )
}

export function ResearcherField({
    study,
    orgSlug,
    opened,
    onOpenChange,
    size,
    mt,
}: PopoverFieldProps & { mt?: string }) {
    return (
        <Stack gap={4} mt={mt}>
            <Text fw={600} size="sm">
                Researcher
            </Text>
            <ResearcherProfilePopover
                userId={study.researcherId}
                studyId={study.id}
                orgSlug={orgSlug}
                name={study.createdBy}
                size={size}
                position="right"
                offset={8}
                arrowSize={12}
                opened={opened}
                onOpenChange={onOpenChange}
            />
        </Stack>
    )
}
