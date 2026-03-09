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

export function DatasetsField({ datasets }: { datasets: string[] }) {
    if (!datasets.length) return null

    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Dataset(s) of interest
            </Text>
            <Text size="sm">{datasets.join(', ')}</Text>
        </Stack>
    )
}

export function PIField({ study }: { study: SelectedStudy }) {
    if (!study.piName) return null

    return (
        <>
            <Divider />
            <Stack gap={4}>
                <Text fw={600} size="sm">
                    Principal Investigator
                </Text>
                <Text size="sm">{study.piName}</Text>
            </Stack>
        </>
    )
}

export function ResearcherField({ study, orgSlug, mt }: { study: SelectedStudy; orgSlug: string; mt?: string }) {
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
            />
        </Stack>
    )
}
