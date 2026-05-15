'use client'

import { useEffect, useRef, useState } from 'react'
import { Anchor, Box, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { CaretRightIcon } from '@phosphor-icons/react'
import dayjs from 'dayjs'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import type { Json } from '@/database/types'

type FeedbackEntryShape = {
    id: string
    entryType: string
    body: Json
    authorName: string
    createdAt: Date | string
    version?: number | null
}

function formatDate(date: Date | string): string {
    return dayjs(date).format('MMM DD, YYYY')
}

const PROPOSAL_ENTRY_TITLES: Record<string, string> = {
    'REVIEWER-FEEDBACK': 'Reviewer feedback',
    'RESUBMISSION-NOTE': 'Resubmission note',
    DECISION: 'Reviewer decision',
    NOTE: 'Reviewer note',
}

function entryTitle(entry: FeedbackEntryShape): string {
    const label = PROPOSAL_ENTRY_TITLES[entry.entryType] ?? 'Feedback entry'
    if (entry.version) return `${label} (v${entry.version}.0)`
    return label
}

const COLLAPSED_LINE_CLAMP = 3

type FeedbackEntryProps = {
    entry: FeedbackEntryShape
    isExpanded: boolean
    onToggle: () => void
}

function FeedbackEntry({ entry, isExpanded, onToggle }: FeedbackEntryProps) {
    const title = entryTitle(entry)
    const date = formatDate(entry.createdAt)
    const bodyRef = useRef<HTMLDivElement>(null)
    const [isTruncated, setIsTruncated] = useState(false)

    // scrollHeight vs clientHeight only reflects overflow while line-clamp is on; once expanded,
    // that comparison stays stale — measure against a fixed collapsed height (lineHeight × clamp) instead.
    useEffect(() => {
        const node = bodyRef.current
        if (!node) return

        const check = () => {
            const lineHeight = parseFloat(getComputedStyle(node).lineHeight)
            if (Number.isFinite(lineHeight) && lineHeight > 0) {
                setIsTruncated(node.scrollHeight > lineHeight * COLLAPSED_LINE_CLAMP + 1)
                return
            }
            setIsTruncated(node.scrollHeight > node.clientHeight)
        }

        check()
        const observer = new ResizeObserver(check)
        observer.observe(node)
        return () => observer.disconnect()
    }, [isExpanded])

    const showToggle = isTruncated

    return (
        <Stack gap="sm" data-testid={`feedback-entry-${entry.id}`}>
            <Text fw={700} fz={14}>
                {title}
            </Text>
            <Box bg="gray.0" p="lg">
                <Stack gap="xs">
                    <Text size="sm" fw={600}>
                        {entry.authorName}
                    </Text>
                    <Text size="sm" c="gray.7">
                        {date}
                    </Text>
                </Stack>
                {/* component="div" because Lexical renders block-level elements that can't nest inside <p> */}
                <Text
                    ref={bodyRef}
                    size="sm"
                    component="div"
                    mt="sm"
                    lineClamp={isExpanded ? undefined : COLLAPSED_LINE_CLAMP}
                    data-testid={`feedback-body-${entry.id}`}
                >
                    <ReadOnlyLexicalContent value={entry.body} />
                </Text>
                {showToggle && (
                    <Anchor
                        component="button"
                        onClick={onToggle}
                        size="sm"
                        fw={700}
                        mt="xs"
                        display="inline-flex"
                        style={{ alignItems: 'center', gap: 4 }}
                        aria-expanded={isExpanded}
                        data-testid={`feedback-toggle-${entry.id}`}
                    >
                        {isExpanded ? 'View less' : 'View more'}
                        <CaretRightIcon
                            size={12}
                            weight="bold"
                            style={{
                                transform: isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)',
                                transition: 'transform 200ms ease',
                            }}
                        />
                    </Anchor>
                )}
            </Box>
        </Stack>
    )
}

function useExpandedEntries(entries: FeedbackEntryShape[]) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        // Resubmission notes must be collapsed by default per spec,
        // so only auto-expand the latest entry when it's reviewer feedback.
        const latest = entries[0]
        if (!latest || latest.entryType === 'RESUBMISSION-NOTE') return new Set()
        return new Set([latest.id])
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

export function FeedbackAndNotesSection({ entries }: { entries: FeedbackEntryShape[] }) {
    const { isExpanded, toggle } = useExpandedEntries(entries)

    if (entries.length === 0) return null

    return (
        <Paper p="xxl" data-testid="feedback-and-notes-section">
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
