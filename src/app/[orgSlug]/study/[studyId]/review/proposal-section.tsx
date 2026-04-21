'use client'

import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from '@/components/study/proposal-fields'
import { usePopover } from '@/hooks/use-popover'
import { stringifyJson } from '@/lib/string'
import { Anchor, Box, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import type { StudyForReview } from './review-types'

type ProposalSectionProps = {
    study: StudyForReview
    orgSlug: string
}

const EVALUATION_CRITERIA = [
    {
        label: 'Feasibility',
        description: 'Can this study be supported with your available data and infrastructure?',
    },
    {
        label: 'Impact',
        description: 'Could the results advance the understanding of teaching and learning?',
    },
    {
        label: 'Researcher background',
        description:
            'Does the researcher have relevant expertise? If a student or post-doc, do they have appropriate faculty or PI supervision?',
    },
]

function useProposalSection() {
    const [isExpanded, { toggle }] = useDisclosure(true)
    const { getPopoverProps } = usePopover()
    return { isExpanded, toggle, getPopoverProps }
}

function formatSubmittedDate(date: Date | null | undefined): string | null {
    if (!date) return null
    return dayjs(date).format('MMM DD, YYYY')
}

function ToggleLink({ isExpanded, onToggle, testId }: { isExpanded: boolean; onToggle: () => void; testId: string }) {
    const label = isExpanded ? 'Hide full initial request' : 'Show full initial request'
    const Icon = isExpanded ? CaretUpIcon : CaretDownIcon

    return (
        <Anchor component="button" onClick={onToggle} c="blue" size="sm" data-testid={testId}>
            <Group gap={4} align="center">
                {label}
                <Icon size={14} />
            </Group>
        </Anchor>
    )
}

function CriteriaList() {
    return (
        <Stack gap={4} data-testid="evaluation-criteria">
            {EVALUATION_CRITERIA.map(({ label, description }) => (
                <Text size="sm" key={label}>
                    <strong>{label}:</strong> {description}
                </Text>
            ))}
        </Stack>
    )
}

function StatusBanner({ labName }: { labName: string }) {
    return (
        <Box bg="purple.0" p="md" style={{ borderRadius: 'var(--mantine-radius-sm)' }} data-testid="status-banner">
            <Stack gap="xs">
                <Text size="sm">
                    <strong>{labName}</strong> has submitted an initial request requesting permission to use your data.
                    Please review it and share your feedback and decision. Consider evaluating the initial request on
                    these criteria:
                </Text>
                <CriteriaList />
            </Stack>
        </Box>
    )
}

export function ProposalSection({ study, orgSlug }: ProposalSectionProps) {
    const { isExpanded, toggle, getPopoverProps } = useProposalSection()
    const submittedDate = formatSubmittedDate(study.submittedAt)
    const labName = study.submittingLabName ?? study.submittedByOrgSlug

    return (
        <Stack gap="md" data-testid="proposal-section">
            <Paper p="xl" data-testid="proposal-section-header">
                <Stack gap="md">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Stack gap={4}>
                            <Text fz="xs" fw={700} c="gray.6">
                                STEP 1
                            </Text>
                            <Title order={2} fz={20} fw={700}>
                                Review initial request
                            </Title>
                            <Text size="sm">Title: {study.title}</Text>
                        </Stack>
                        {submittedDate && (
                            <Text fz={12} c="gray.6" style={{ whiteSpace: 'nowrap' }}>
                                Submitted on {submittedDate}
                            </Text>
                        )}
                    </Group>

                    <Divider />

                    <StatusBanner labName={labName} />

                    <ToggleLink isExpanded={isExpanded} onToggle={toggle} testId="proposal-toggle-header" />
                </Stack>
            </Paper>

            <Collapse in={isExpanded}>
                <Paper p="xl" data-testid="proposal-body">
                    <Stack gap="md">
                        <DatasetsField datasets={study.datasets ?? []} orgDataSources={study.orgDataSources} />
                        <LexicalProposalField
                            label="Research question(s)"
                            value={stringifyJson(study.researchQuestions)}
                            divider="default"
                        />
                        <LexicalProposalField label="Project summary" value={stringifyJson(study.projectSummary)} />
                        <LexicalProposalField label="Impact" value={stringifyJson(study.impact)} />
                        <LexicalProposalField
                            label="Additional notes or requests"
                            value={stringifyJson(study.additionalNotes)}
                        />
                        <PIField study={study} orgSlug={orgSlug} size="sm" {...getPopoverProps('pi')} />
                        <ResearcherField
                            study={study}
                            orgSlug={orgSlug}
                            size="sm"
                            mt="md"
                            {...getPopoverProps('researcher')}
                        />
                        <Divider />
                        <ToggleLink isExpanded={isExpanded} onToggle={toggle} testId="proposal-toggle-body" />
                    </Stack>
                </Paper>
            </Collapse>
        </Stack>
    )
}
