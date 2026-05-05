'use client'

import { useState } from 'react'
import { Anchor, Collapse, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import type { ProposalFeedbackEntry } from '@/server/actions/study.actions'

function formatDate(date: Date | string): string {
    return dayjs(date).format('MMM DD, YYYY')
}

function entryTitle(entry: ProposalFeedbackEntry): string {
    return entry.entryType === 'REVIEWER-FEEDBACK' ? 'Reviewer feedback' : 'Resubmission note'
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
                <Text size="sm" component="div" data-testid={`feedback-body-${entry.id}`}>
                    <ReadOnlyLexicalContent value={JSON.stringify(entry.body)} />
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

export function FeedbackAndNotesSection({ entries }: { entries: ProposalFeedbackEntry[] }) {
    const { isExpanded, toggle } = useExpandedEntries(entries)

    if (entries.length === 0) return null

    return (
        <Paper p="xl" data-testid="feedback-and-notes-section">
            <Stack gap="md">
                <Title order={4} fz={20} c="charcoal.9" pb={4}>
                    Feedback and notes
                </Title>
                <Divider />
                <Stack gap="md" data-testid="feedback-entries">
                    {entries.map((entry, idx) => (
                        <Stack key={entry.id} gap="md">
                            <FeedbackEntry
                                entry={entry}
                                isExpanded={isExpanded(entry.id)}
                                onToggle={() => toggle(entry.id)}
                            />
                            {idx < entries.length - 1 && <Divider data-testid="entry-divider" />}
                        </Stack>
                    ))}
                </Stack>
            </Stack>
        </Paper>
    )
}
