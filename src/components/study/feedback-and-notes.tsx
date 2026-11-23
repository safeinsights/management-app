'use client'

import { type RefObject, useEffect, useRef, useState } from 'react'
import { Box, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { AlertNotFound } from '@/components/errors'
import { LocalDateTime } from '@/components/local-date-time'
import { PoliteStatus, useAnnouncement } from '@/components/polite-status'
import { ReadOnlyLexicalContent } from '@/components/readonly-lexical-content'
import type { Json } from '@/database/types'
import { CollapseToggleLink } from './collapse-toggle-link'
import { fontWeight, semanticColor } from '@/theme/tokens'

type FeedbackEntryShape = {
    id: string
    entryType: string
    body: Json
    authorName: string
    createdAt: Date | string
    version?: number | null
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

const COLLAPSED_LINE_CLAMP = 2
const COMPACT_VISIBLE_ENTRIES = 2

type FeedbackEntryProps = {
    entry: FeedbackEntryShape
    isExpanded: boolean
    onToggle: () => void
    focusRef?: RefObject<HTMLDivElement | null>
}

function FeedbackEntry({ entry, isExpanded, onToggle, focusRef }: FeedbackEntryProps) {
    const title = entryTitle(entry)
    const toggleLabel = isExpanded ? 'View less' : 'View more'
    const bodyRef = useRef<HTMLDivElement>(null)
    const [isTruncated, setIsTruncated] = useState(false)

    // scrollHeight vs clientHeight only reflects overflow while line-clamp is on, so it goes
    // stale once expanded; measure against a fixed collapsed height instead.
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

    return (
        <Stack ref={focusRef} tabIndex={focusRef ? -1 : undefined} gap="sm" data-testid={`feedback-entry-${entry.id}`}>
            <Text fw={fontWeight.bold} fz="sm">
                {title}
            </Text>
            <Box bg={semanticColor('surface.sunken')} p="lg">
                <Stack gap="xs">
                    <Text size="sm" fw={fontWeight.bold}>
                        {entry.authorName}
                    </Text>
                    <Text size="xs" c={semanticColor('text.secondary')}>
                        <LocalDateTime value={entry.createdAt} />
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
                    <ReadOnlyLexicalContent value={entry.body} label={`Feedback from ${entry.authorName}`} />
                </Text>
                <CollapseToggleLink
                    isVisible={isTruncated}
                    label={toggleLabel}
                    isExpanded={isExpanded}
                    onClick={onToggle}
                    mt="xs"
                    testId={`feedback-toggle-${entry.id}`}
                />
            </Box>
        </Stack>
    )
}

function useExpandedEntries(entries: FeedbackEntryShape[], alwaysExpandLatest: boolean, compact: boolean) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
        // A newest resubmission note stays collapsed: the researcher just wrote it (OTTER-558).
        const latest = entries[0]
        if (!latest || compact) return new Set()
        if (!alwaysExpandLatest && latest.entryType === 'RESUBMISSION-NOTE') return new Set()
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

function useEarlierEntries(entries: FeedbackEntryShape[], compact: boolean) {
    const [showAll, setShowAll] = useState(false)
    const toggleRef = useRef<HTMLButtonElement>(null)
    const firstEarlierRef = useRef<HTMLDivElement>(null)
    const movesFocus = useRef(false)
    const [announcement, announce] = useAnnouncement()

    // The entries View all reveals only exist after the render it causes.
    useEffect(() => {
        if (!movesFocus.current) return
        movesFocus.current = false
        if (showAll) {
            firstEarlierRef.current?.focus()
            return
        }
        toggleRef.current?.focus()
    }, [showAll])

    const hasEarlier = compact && entries.length > COMPACT_VISIBLE_ENTRIES
    const firstEarlierId = hasEarlier ? entries[COMPACT_VISIBLE_ENTRIES].id : null

    return {
        hasEarlier,
        showAll,
        visibleEntries: hasEarlier && !showAll ? entries.slice(0, COMPACT_VISIBLE_ENTRIES) : entries,
        toggleRef,
        focusRefFor: (id: string) => (id === firstEarlierId ? firstEarlierRef : undefined),
        announcement,
        // Focus lands on one entry, which says nothing about how many the list now holds.
        toggleShowAll: () => {
            movesFocus.current = true
            announce(
                showAll
                    ? `Showing ${COMPACT_VISIBLE_ENTRIES} of ${entries.length} notes and feedback`
                    : `Showing all ${entries.length} notes and feedback`,
            )
            setShowAll((current) => !current)
        },
    }
}

// Shared with the code run history, whose rows each show one run's outputs feedback.
export function FeedbackEntries({
    entries,
    alwaysExpandLatest = false,
    compact = false,
    testId = 'feedback-entries',
}: {
    entries: FeedbackEntryShape[]
    alwaysExpandLatest?: boolean
    compact?: boolean
    testId?: string
}) {
    const { isExpanded, toggle } = useExpandedEntries(entries, alwaysExpandLatest, compact)
    const { visibleEntries, hasEarlier, showAll, toggleRef, focusRefFor, announcement, toggleShowAll } =
        useEarlierEntries(entries, compact)

    return (
        <Stack gap="md" data-testid={testId}>
            {visibleEntries.map((entry, idx) => (
                <Stack key={entry.id} gap="md">
                    <FeedbackEntry
                        entry={entry}
                        isExpanded={isExpanded(entry.id)}
                        onToggle={() => toggle(entry.id)}
                        focusRef={focusRefFor(entry.id)}
                    />
                    {idx < visibleEntries.length - 1 && <Divider data-testid="entry-divider" />}
                </Stack>
            ))}
            <CollapseToggleLink
                ref={toggleRef}
                isVisible={hasEarlier}
                label={showAll ? 'Hide earlier notes and feedback' : 'View all notes and feedback'}
                isExpanded={showAll}
                withAriaExpanded={false}
                onClick={toggleShowAll}
                testId="feedback-show-all"
            />
            {hasEarlier && <PoliteStatus announcement={announcement} />}
        </Stack>
    )
}

export function FeedbackAndNotesSection({
    entries,
    alwaysExpandLatest = false,
    compact = false,
    loadError = false,
    isVisible = true,
}: {
    entries: FeedbackEntryShape[]
    alwaysExpandLatest?: boolean
    /** Shows the latest two entries, all collapsed to two lines, with a toggle for the earlier ones. */
    compact?: boolean
    /** Shows a notice rather than hiding the section, so a failed query never reads as "no feedback". */
    loadError?: boolean
    isVisible?: boolean
}) {
    if (!isVisible) return null
    if (loadError) return <AlertNotFound title="Feedback could not be loaded" message="Please refresh and try again" />
    if (entries.length === 0) return null

    return (
        <Paper p="xxl" data-testid="feedback-and-notes-section">
            <Stack gap="md">
                <Title order={3} fz="xl" c={semanticColor('text.primary')} pb="xxs">
                    Feedback and notes
                </Title>
                <Divider />
                <FeedbackEntries entries={entries} alwaysExpandLatest={alwaysExpandLatest} compact={compact} />
            </Stack>
        </Paper>
    )
}
