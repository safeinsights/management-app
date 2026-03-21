'use client'

import { Divider, Stack, Text } from '@mantine/core'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import { ResearcherProfilePopover } from '@/components/researcher-profile-popover'
import type { SelectedStudy } from '@/server/actions/study.actions'

export function LexicalProposalField({
    label,
    value,
    divider = 'subtle',
}: {
    label: string
    value?: string | null
    divider?: 'subtle' | 'default' | 'none'
}) {
    if (!value) return null

    return (
        <>
            {divider !== 'none' && <Divider color={divider === 'subtle' ? 'gray.1' : undefined} />}
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    {label}
                </Text>
                <Text size="sm" component="div">
                    <ReadOnlyLexicalContent value={value} />
                </Text>
            </Stack>
        </>
    )
}

export function DatasetsField({
    datasets,
    orgDataSources,
}: {
    datasets: string[]
    orgDataSources: Array<{ id: string; name: string }>
}) {
    if (!datasets.length) return null

    const nameMap = Object.fromEntries(orgDataSources.map((ds) => [ds.id, ds.name]))

    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Dataset(s) of interest
            </Text>
            <Text size="sm">{datasets.map((id) => nameMap[id] || id).join(', ')}</Text>
        </Stack>
    )
}

interface PopoverFieldProps {
    study: SelectedStudy
    orgSlug: string
    opened: boolean
    onOpenChange: (opened: boolean) => void
}

export function PIField({ study, orgSlug, opened, onOpenChange }: PopoverFieldProps) {
    if (!study.piName) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Principal Investigator
                </Text>
                {study.piUserId ? (
                    <ResearcherProfilePopover
                        userId={study.piUserId}
                        studyId={study.id}
                        orgSlug={orgSlug}
                        name={study.piName}
                        position="right"
                        offset={8}
                        arrowSize={12}
                        opened={opened}
                        onOpenChange={onOpenChange}
                    />
                ) : (
                    <Text size="sm">{study.piName}</Text>
                )}
            </Stack>
        </>
    )
}

export function ResearcherField({ study, orgSlug, opened, onOpenChange, mt }: PopoverFieldProps & { mt?: string }) {
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
                position="right"
                offset={8}
                arrowSize={12}
                opened={opened}
                onOpenChange={onOpenChange}
            />
        </Stack>
    )
}
