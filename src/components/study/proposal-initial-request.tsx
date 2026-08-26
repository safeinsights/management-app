'use client'

import { useState, type FC, type ReactNode } from 'react'
import { Divider, Paper, Stack, Text } from '@mantine/core'
import { stringifyJson } from '@/lib/string'
import { extractTextFromLexical } from '@/lib/lexical'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { decisionTimestampForProposalHeader } from '@/lib/studies'
import { type Submitted } from '@/schema/study'
import { CollapseToggleLink } from './collapse-toggle-link'
import { DatasetsField, LexicalProposalField, PIField, ResearcherField } from './proposal-fields'
import { ProposalStepHeader } from './proposal-step-header'

const EXPAND_LABEL = 'View full proposal'
const COLLAPSE_LABEL = 'Hide full proposal'
const SNIPPET_LINE_CLAMP = 2

type ProposalRequestProps = {
    study: Submitted<SelectedStudy>
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
    const toggle = () => setExpanded((prev) => !prev)
    const collapse = () => setExpanded(false)
    return { expanded, toggle, collapse }
}

/**
 * Plain text, not clamped Lexical: the snippet must be exactly two visible lines, and an empty
 * Lexical paragraph inside the stored value would spend one of them on blank space.
 */
function researchQuestionPreview(researchQuestions: SelectedStudy['researchQuestions']): string {
    return extractTextFromLexical(stringifyJson(researchQuestions) ?? undefined)
        .replace(/\s+/g, ' ')
        .trim()
}

const ConditionalDivider: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Divider />
}

const ResearchQuestionSnippet: FC<{ preview: string }> = ({ preview }) => {
    if (!preview) return null

    return (
        <Stack gap={4}>
            <Text fw={600} size="sm">
                Research question(s)
            </Text>
            <Text size="md" lineClamp={SNIPPET_LINE_CLAMP} data-testid="proposal-snippet-question">
                {preview}
            </Text>
        </Stack>
    )
}

type ProposalSnippetProps = {
    isVisible: boolean
    study: Submitted<SelectedStudy>
    onExpand: () => void
}

const ProposalSnippet: FC<ProposalSnippetProps> = ({ isVisible, study, onExpand }) => {
    if (!isVisible) return null

    const datasets = study.datasets ?? []
    const preview = researchQuestionPreview(study.researchQuestions)
    const hasBothSections = datasets.length > 0 && preview !== ''

    return (
        <Stack gap="md" data-testid="proposal-snippet">
            <DatasetsField datasets={datasets} orgDataSources={study.orgDataSources} size="sm" />
            <ConditionalDivider isVisible={hasBothSections} />
            <ResearchQuestionSnippet preview={preview} />
            <CollapseToggleLink
                label={EXPAND_LABEL}
                isExpanded={false}
                onClick={onExpand}
                testId="proposal-toggle-snippet"
            />
        </Stack>
    )
}

type ProposalExpandedBodyProps = {
    isVisible: boolean
    study: Submitted<SelectedStudy>
    orgSlug: string
    onCollapse: () => void
}

const ProposalExpandedBody: FC<ProposalExpandedBodyProps> = ({ isVisible, study, orgSlug, onCollapse }) => {
    if (!isVisible) return null

    const datasets = study.datasets ?? []
    const hasAdditionalNotes = Boolean(study.additionalNotes)

    return (
        <Stack gap="md" data-testid="proposal-body">
            <CollapseToggleLink label={COLLAPSE_LABEL} isExpanded onClick={onCollapse} testId="proposal-toggle-top" />

            <DatasetsField datasets={datasets} orgDataSources={study.orgDataSources} size="sm" />
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

            <LexicalProposalField label="Impact" value={stringifyJson(study.impact)} divider="none" size="md" />

            <ConditionalDivider isVisible={hasAdditionalNotes} />

            <LexicalProposalField
                label="Additional notes or requests"
                value={stringifyJson(study.additionalNotes)}
                divider="none"
                size="md"
            />

            <PIField study={study} orgSlug={orgSlug} />
            <ResearcherField study={study} orgSlug={orgSlug} mt="md" />
            <Divider />
            <CollapseToggleLink
                label={COLLAPSE_LABEL}
                isExpanded
                onClick={onCollapse}
                testId="proposal-toggle-bottom"
            />
        </Stack>
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
    const { expanded, toggle, collapse } = useProposalRequest(initialExpanded)
    const timestampDate = decisionTimestampForProposalHeader(study, entries)

    return (
        <Stack gap="xxl" data-testid="proposal-section">
            <ProposalStepHeader
                stepLabel={stepLabel}
                heading={heading}
                studyTitle={study.title}
                timestampDate={timestampDate}
                timestampLabel={statusBadge}
                banner={banner}
            />

            {/* The proposal owns its own card (OTTER-755), so the status card above it holds the
                step, title and banner only. Collapsing swaps the card's content for a snippet
                rather than hiding it, which is why there is no Mantine Collapse here. */}
            <Paper p="xxl" data-testid="proposal-card">
                <ProposalSnippet isVisible={!expanded} study={study} onExpand={toggle} />
                <ProposalExpandedBody isVisible={expanded} study={study} orgSlug={orgSlug} onCollapse={collapse} />
            </Paper>
        </Stack>
    )
}
