'use client'

import { FC, useState } from 'react'
import { Divider, Paper, Stack, Text, Group, Anchor, Collapse } from '@mantine/core'
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { extractTextFromLexical } from '@/lib/word-count'
import type { ProposalFeedbackEntry } from './types'

// OTTER-521 surfaces the same reviewer feedback + resubmission notes the
// PostFeedbackView (OTTER-501) shows, so the researcher has full context while
// editing. Once OTTER-501 lands we may extract a shared component; for now this
// renders the entries inline.
interface FeedbackAndNotesSectionProps {
    entries: ProposalFeedbackEntry[]
}

const formatDate = (date: Date | string) => dayjs(date).format('MMM DD, YYYY')

const entryTitle = (entry: ProposalFeedbackEntry) =>
    entry.entryType === 'REVIEWER-FEEDBACK' ? 'Reviewer feedback' : 'Resubmission note'

const entryBodyText = (entry: ProposalFeedbackEntry) => extractTextFromLexical(JSON.stringify(entry.body))

interface FeedbackEntryProps {
    entry: ProposalFeedbackEntry
    isExpanded: boolean
    onToggle: () => void
}

const FeedbackEntry: FC<FeedbackEntryProps> = ({ entry, isExpanded, onToggle }) => {
    const Icon = isExpanded ? CaretUpIcon : CaretDownIcon
    return (
        <Stack gap="sm" data-testid={`feedback-entry-${entry.id}`}>
            <Group justify="space-between" align="center">
                <Stack gap={2}>
                    <Text fw={600}>{entryTitle(entry)}</Text>
                    <Text size="sm" c="gray.7">
                        {entry.authorName} · {formatDate(entry.createdAt)}
                    </Text>
                </Stack>
                <Anchor component="button" onClick={onToggle} c="blue" size="sm" aria-expanded={isExpanded}>
                    <Icon size={14} />
                </Anchor>
            </Group>
            <Collapse in={isExpanded}>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {entryBodyText(entry)}
                </Text>
            </Collapse>
        </Stack>
    )
}

export const FeedbackAndNotesSection: FC<FeedbackAndNotesSectionProps> = ({ entries }) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        const latest = entries[0]?.id
        return latest ? new Set([latest]) : new Set()
    })
    const toggle = (id: string) =>
        setExpandedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    if (entries.length === 0) return null

    return (
        <Paper p="xxl" data-testid="feedback-and-notes-section">
            <Stack gap="md">
                <Text fw={600} fz={20}>
                    Feedback and notes
                </Text>
                <Divider />
                <Stack gap="md">
                    {entries.map((entry, idx) => (
                        <Stack key={entry.id} gap="md">
                            <FeedbackEntry
                                entry={entry}
                                isExpanded={expandedIds.has(entry.id)}
                                onToggle={() => toggle(entry.id)}
                            />
                            {idx < entries.length - 1 && <Divider />}
                        </Stack>
                    ))}
                </Stack>
            </Stack>
        </Paper>
    )
}
