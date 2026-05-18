'use client'

import { useState, type ReactNode } from 'react'
import { Anchor, Collapse, Divider, Paper, Stack } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react/dist/ssr'
import { stringifyJson } from '@/lib/string'
import { usePopover } from '@/hooks/use-popover'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { decisionTimestampForProposalHeader } from '@/lib/studies'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from './proposal-fields'
import { ProposalStepHeader } from './proposal-step-header'

type ProposalRequestProps = {
    study: SelectedStudy
    orgSlug: string
    stepLabel: string
    heading: string
    banner: ReactNode
    initialExpanded?: boolean
    statusBadge?: string
    entries?: ProposalFeedbackEntry[]
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
    statusBadge = 'Submitted on',
    entries = [],
}: ProposalRequestProps) {
    const { expanded, toggle, collapse, getPopoverProps } = useProposalRequest(initialExpanded)
    const timestampDate = decisionTimestampForProposalHeader(study, entries)

    return (
        <Stack gap="md" data-testid="proposal-section">
            <ProposalStepHeader
                stepLabel={stepLabel}
                heading={heading}
                studyTitle={study.title}
                timestampDate={timestampDate}
                timestampLabel={statusBadge}
                banner={banner}
            >
                <ToggleLink isExpanded={expanded} onClick={toggle} testId="proposal-toggle-header" />
            </ProposalStepHeader>

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
