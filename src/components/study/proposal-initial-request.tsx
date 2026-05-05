'use client'

import { useState, type ReactNode } from 'react'
import { Anchor, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { stringifyJson } from '@/lib/string'
import { usePopover } from '@/hooks/use-popover'
import type { SelectedStudy } from '@/server/actions/study.actions'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from './proposal-fields'

type ProposalRequestProps = {
    study: SelectedStudy
    orgSlug: string
    stepLabel: string
    heading: string
    banner: ReactNode
    initialExpanded?: boolean
    statusBadge?: string
}

function useProposalRequest(initialExpanded: boolean) {
    const [expanded, setExpanded] = useState(initialExpanded)
    const { getPopoverProps } = usePopover()
    const toggle = () => setExpanded((prev) => !prev)
    const collapse = () => setExpanded(false)
    return { expanded, toggle, collapse, getPopoverProps }
}

function ToggleLink({ isExpanded, onClick, testId }: { isExpanded: boolean; onClick: () => void; testId?: string }) {
    return (
        <Anchor
            component="button"
            size="sm"
            fw={700}
            onClick={onClick}
            display="inline-flex"
            style={{ alignItems: 'center', gap: 4 }}
            data-testid={testId}
        >
            {isExpanded ? 'Hide full initial request' : 'View full initial request'}
            <CaretRightIcon
                size={12}
                weight="bold"
                style={{
                    transform: isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms ease',
                }}
            />
        </Anchor>
    )
}

export function ProposalRequest({
    study,
    orgSlug,
    stepLabel,
    heading,
    banner,
    initialExpanded = true,
    statusBadge,
}: ProposalRequestProps) {
    const { expanded, toggle, collapse, getPopoverProps } = useProposalRequest(initialExpanded)

    return (
        <Stack gap="md" data-testid="proposal-section">
            <Paper p="xxl" data-testid="proposal-section-header">
                <Text fz={10} fw={700} c="charcoal.7" pb={4}>
                    {stepLabel}
                </Text>
                <Title order={4} fz={20} c="charcoal.9" pb={4}>
                    {heading}
                </Title>
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Text c="charcoal.9" style={{ maxWidth: '105ch', wordBreak: 'break-word' }}>
                        Title: {study.title}
                    </Text>
                    {study.submittedAt && (
                        <Text fz={12} c="charcoal.7" style={{ whiteSpace: 'nowrap' }} data-testid="proposal-timestamp">
                            {statusBadge ?? 'Submitted on'} {dayjs(study.submittedAt).format('MMM DD, YYYY')}
                        </Text>
                    )}
                </Group>
                <Divider my="md" data-testid="proposal-header-divider" />
                {banner}
                <ToggleLink isExpanded={expanded} onClick={toggle} testId="proposal-toggle-header" />
            </Paper>

            <Collapse in={expanded}>
                <Paper p="xxl" data-testid="proposal-body">
                    <Stack gap="md">
                        <DatasetsField
                            datasets={study.datasets ?? []}
                            orgDataSources={study.orgDataSources}
                            size="sm"
                        />
                        <Divider />

                        <LexicalProposalField
                            label="Research question(s)"
                            value={stringifyJson(study.researchQuestions)}
                            divider="none"
                            size="md"
                        />
                        <Divider />

                        <LexicalProposalField
                            label="Project summary"
                            value={stringifyJson(study.projectSummary)}
                            divider="none"
                            size="md"
                        />
                        <Divider />

                        <LexicalProposalField
                            label="Impact"
                            value={stringifyJson(study.impact)}
                            divider="none"
                            size="md"
                        />

                        {study.additionalNotes && <Divider />}

                        <LexicalProposalField
                            label="Additional notes or requests"
                            value={stringifyJson(study.additionalNotes)}
                            divider="none"
                            size="md"
                        />

                        <PIField study={study} orgSlug={orgSlug} {...getPopoverProps('pi')} />
                        <ResearcherField study={study} orgSlug={orgSlug} {...getPopoverProps('researcher')} mt="md" />
                        <Divider />
                        <ToggleLink isExpanded={true} onClick={collapse} testId="proposal-toggle-body" />
                    </Stack>
                </Paper>
            </Collapse>
        </Stack>
    )
}
