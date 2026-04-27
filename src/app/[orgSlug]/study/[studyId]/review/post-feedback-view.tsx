'use client'

import { PageBreadcrumbs } from '@/components/page-breadcrumbs'
import type { ReviewDecision } from '@/database/types'
import { Routes } from '@/lib/routes'
import { extractTextFromLexical } from '@/lib/word-count'
import { Anchor, Box, Button, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ProposalFeedbackEntry, SelectedStudy } from '@/server/actions/study.actions'
import { ProposalSection } from './proposal-section'

type PostFeedbackViewProps = {
    orgSlug: string
    study: SelectedStudy
    entries: ProposalFeedbackEntry[]
}

type DecisionCopy = {
    timestampLabel: string
    banner: { bg: string; color: string; testId: string; copy: string }
}

const DECISION_COPY: Record<ReviewDecision, DecisionCopy> = {
    APPROVE: {
        timestampLabel: 'Approved',
        banner: {
            bg: 'green.1',
            color: 'green.8',
            testId: 'decision-banner-approved',
            copy: "This initial request has been approved. You'll receive email notifications when the researcher proceeds to the next step.",
        },
    },
    'NEEDS-CLARIFICATION': {
        timestampLabel: 'Clarification requested',
        banner: {
            bg: 'yellow.1',
            color: 'yellow.9',
            testId: 'decision-banner-clarification',
            copy: 'You have requested clarification. The researcher has been notified, and we will inform you once they resubmit.',
        },
    },
    REJECT: {
        timestampLabel: 'Rejected',
        banner: {
            bg: 'red.1',
            color: 'red.8',
            testId: 'decision-banner-rejected',
            copy: 'This initial request has been rejected. No further action is required at this time.',
        },
    },
}

function formatDate(date: Date | string): string {
    return dayjs(date).format('MMM DD, YYYY')
}

function entryTitle(entry: ProposalFeedbackEntry): string {
    return entry.entryType === 'REVIEWER-FEEDBACK' ? 'Reviewer feedback' : 'Resubmission note'
}

// TODO(OTTER-491): swap plain-text rendering for a Lexical viewer once the editor
// component lands; share node config with the textarea.
function entryBodyText(entry: ProposalFeedbackEntry): string {
    return extractTextFromLexical(JSON.stringify(entry.body))
}

function DecisionBanner({ decision }: { decision: ReviewDecision }) {
    const { banner } = DECISION_COPY[decision]
    return (
        <Box bg={banner.bg} p="md" style={{ borderRadius: 'var(--mantine-radius-sm)' }} data-testid={banner.testId}>
            <Text c={banner.color} size="sm">
                {banner.copy}
            </Text>
        </Box>
    )
}

function FullProposalDropdown({ orgSlug, study }: { orgSlug: string; study: SelectedStudy }) {
    return <ProposalSection orgSlug={orgSlug} study={study} initialExpanded={false} />
}

function ToggleCaret({ isExpanded }: { isExpanded: boolean }) {
    const Icon = isExpanded ? CaretUpIcon : CaretDownIcon
    return <Icon size={14} />
}

type FeedbackEntryProps = {
    entry: ProposalFeedbackEntry
    isExpanded: boolean
    onToggle: () => void
}

function FeedbackEntry({ entry, isExpanded, onToggle }: FeedbackEntryProps) {
    const title = entryTitle(entry)
    const body = entryBodyText(entry)
    const date = formatDate(entry.createdAt)

    return (
        <Stack gap="sm" data-testid={`feedback-entry-${entry.id}`}>
            <Group justify="space-between" align="center">
                <Stack gap={2}>
                    <Text fw={600}>{title}</Text>
                    <Text size="sm" c="gray.7">
                        {entry.authorName} · {date}
                    </Text>
                </Stack>
                <Anchor
                    component="button"
                    onClick={onToggle}
                    c="blue"
                    size="sm"
                    data-testid={`feedback-toggle-${entry.id}`}
                    aria-expanded={isExpanded}
                >
                    <ToggleCaret isExpanded={isExpanded} />
                </Anchor>
            </Group>
            <Collapse in={isExpanded}>
                <Text size="sm" data-testid={`feedback-body-${entry.id}`} style={{ whiteSpace: 'pre-wrap' }}>
                    {body}
                </Text>
            </Collapse>
        </Stack>
    )
}

function useExpandedEntries(entries: ProposalFeedbackEntry[]) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        const latest = entries[0]?.id
        return latest ? new Set([latest]) : new Set()
    })

    const toggle = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    const isExpanded = (id: string) => expandedIds.has(id)

    return { isExpanded, toggle }
}

function FeedbackAndNotesSection({ entries }: { entries: ProposalFeedbackEntry[] }) {
    const { isExpanded, toggle } = useExpandedEntries(entries)

    return (
        <Paper p="xl" data-testid="feedback-and-notes-section">
            <Stack gap="md">
                <Text fw={600} fz={20}>
                    Feedback and notes
                </Text>
                <Divider />
                <Stack gap="md" data-testid="feedback-entries">
                    {entries.map((entry, idx) => (
                        <Stack key={entry.id} gap="md">
                            <FeedbackEntry
                                entry={entry}
                                isExpanded={isExpanded(entry.id)}
                                onToggle={() => toggle(entry.id)}
                            />
                            {idx < entries.length - 1 && <Divider data-testid="feedback-entry-divider" />}
                        </Stack>
                    ))}
                </Stack>
            </Stack>
        </Paper>
    )
}

function GoToDashboardButton() {
    const router = useRouter()
    const handleClick = () => router.push(Routes.dashboard)
    return (
        <Button onClick={handleClick} data-testid="go-to-dashboard">
            Go to dashboard
        </Button>
    )
}

type DecisionHeaderProps = {
    study: SelectedStudy
    decision: ReviewDecision
    decidedAt: Date | string
}

function DecisionHeader({ study, decision, decidedAt }: DecisionHeaderProps) {
    const copy = DECISION_COPY[decision]
    const date = formatDate(decidedAt)

    return (
        <Stack gap="md" data-testid="decision-header">
            <Stack gap={4}>
                <Title order={1} fz={40} fw={700}>
                    Study Proposal
                </Title>
                <Text fz={20} fw={600}>
                    Review initial request
                </Text>
                <Text size="sm">Title: {study.title}</Text>
                <Text size="sm" c="gray.7" data-testid="decision-timestamp">
                    {copy.timestampLabel} on {date}
                </Text>
            </Stack>
            <Divider />
        </Stack>
    )
}

export function PostFeedbackView({ orgSlug, study, entries }: PostFeedbackViewProps) {
    const latest = entries[0]
    if (!latest || latest.decision === null) {
        return null
    }

    const decision = latest.decision

    return (
        <Box bg="grey.10">
            <Stack px="xl" gap="xl" py="xl">
                <PageBreadcrumbs crumbs={[['Dashboard', Routes.orgDashboard({ orgSlug })], ['Study proposal']]} />
                <DecisionHeader study={study} decision={decision} decidedAt={latest.createdAt} />
                <DecisionBanner decision={decision} />
                <FullProposalDropdown orgSlug={orgSlug} study={study} />
                <FeedbackAndNotesSection entries={entries} />
                <Group justify="flex-end">
                    <GoToDashboardButton />
                </Group>
            </Stack>
        </Box>
    )
}
