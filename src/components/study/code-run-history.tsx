'use client'

import { ActionIcon, Badge, Collapse, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { FC, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { ToggleChevron } from '@/components/icons'
import { LocalDateTime } from '@/components/local-date-time'
import { CollapseToggleLink } from '@/components/study/collapse-toggle-link'
import { fontWeight, semanticColor } from '@/theme/tokens'
import type { PriorCodeRun } from '@/server/db/queries'

const VISIBLE_RUNS = 3

// Matches the decided banner and decision email, which call a job errored if it ever errored, even
// when a rerun in the same job then completed.
const codeRunBadges = (statusChanges: PriorCodeRun['statusChanges']): string[] => {
    const statuses = new Set(statusChanges.map((change) => change.status))
    return [
        statuses.has('JOB-ERRORED') && 'Code errored',
        statuses.has('FILES-APPROVED') && 'Outputs and feedback',
        statuses.has('FILES-REJECTED') && 'Feedback only',
    ].filter((label): label is string => !!label)
}

// Hide and View less only change what is shown; what the reviewer opened lives here so it comes
// back, and is lost on refresh or navigation because it is never written to storage.
function useCodeRunHistory(runs: PriorCodeRun[]) {
    const [isOpen, { toggle }] = useDisclosure(false)
    const [showAll, setShowAll] = useState(false)
    const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set())
    const caretRefs = useRef(new Map<string, HTMLButtonElement>())
    const showAllRef = useRef<HTMLButtonElement>(null)
    const movesFocus = useRef(false)

    // The rows View all runs reveals only exist after the render it causes.
    useEffect(() => {
        if (!movesFocus.current) return
        movesFocus.current = false
        if (showAll) caretRefs.current.get(runs[VISIBLE_RUNS]?.id)?.focus()
        else showAllRef.current?.focus()
    }, [showAll, runs])

    return {
        isOpen,
        toggle,
        showAll,
        visibleRuns: showAll ? runs : runs.slice(0, VISIBLE_RUNS),
        expandedIds,
        showAllRef,
        toggleShowAll: () => {
            movesFocus.current = true
            setShowAll((current) => !current)
        },
        toggleRow: (id: string) =>
            setExpandedIds((current) => {
                const next = new Set(current)
                if (!next.delete(id)) next.add(id)
                return next
            }),
        registerCaret: (id: string, element: HTMLButtonElement | null) => {
            if (element) caretRefs.current.set(id, element)
            else caretRefs.current.delete(id)
        },
    }
}

type CodeRunHistoryRowProps = {
    run: PriorCodeRun
    isExpanded: boolean
    onToggle: (id: string) => void
    registerCaret: (id: string, element: HTMLButtonElement | null) => void
}

const CodeRunHistoryRow: FC<CodeRunHistoryRowProps> = ({ run, isExpanded, onToggle, registerCaret }) => {
    const titleId = useId()

    return (
        <Paper withBorder p="lg" data-testid="code-run-history-row">
            <Group justify="space-between" wrap="nowrap">
                <Group gap="sm">
                    <Title id={titleId} order={4} fz="lg" fw={fontWeight.semibold} c={semanticColor('text.primary')}>
                        Code run
                        <LocalDateTime value={run.ranAt} prefix=" • " />
                    </Title>
                    {codeRunBadges(run.statusChanges).map((label) => (
                        <Badge key={label} color="grey" variant="light">
                            {label}
                        </Badge>
                    ))}
                </Group>
                <ActionIcon
                    ref={(element) => registerCaret(run.id, element)}
                    variant="subtle"
                    onClick={() => onToggle(run.id)}
                    aria-labelledby={titleId}
                    aria-expanded={isExpanded}
                >
                    <ToggleChevron isExpanded={isExpanded} />
                </ActionIcon>
            </Group>
        </Paper>
    )
}

type ShowAllRunsProps = {
    isVisible: boolean
    showAll: boolean
    total: number
    onToggle: () => void
    buttonRef: RefObject<HTMLButtonElement | null>
}

const ShowAllRuns: FC<ShowAllRunsProps> = ({ isVisible, showAll, total, onToggle, buttonRef }) => {
    if (!isVisible) return null
    return (
        <Stack gap="xs" align="center">
            <Text fz="sm" c={semanticColor('text.secondary')}>
                Showing {showAll ? total : VISIBLE_RUNS} of {total} previous runs
            </Text>
            <CollapseToggleLink
                ref={buttonRef}
                label={showAll ? 'View less' : 'View all runs'}
                isExpanded={showAll}
                onClick={onToggle}
                withChevron={false}
                size="md"
            />
        </Stack>
    )
}

// `runs` never holds the latest run, which has its own card above; with no earlier runs there is
// no history to show.
export const CodeRunHistory: FC<{ runs: PriorCodeRun[] }> = ({ runs }) => {
    const history = useCodeRunHistory(runs)
    const listId = useId()

    if (runs.length === 0) return null

    return (
        <Paper withBorder p="lg" bg={semanticColor('surface.page')} data-testid="code-run-history">
            <Group justify="space-between" wrap="nowrap">
                <Title order={3} fz="md" fw={fontWeight.regular} c={semanticColor('text.secondary')}>
                    Code run history ({runs.length})
                </Title>
                <CollapseToggleLink
                    label={history.isOpen ? 'Hide code run history' : 'View code run history'}
                    isExpanded={history.isOpen}
                    onClick={history.toggle}
                    controls={listId}
                    withChevron={false}
                    size="md"
                />
            </Group>
            <Collapse in={history.isOpen} id={listId}>
                <Stack gap="md" pt="lg">
                    {history.visibleRuns.map((run) => (
                        <CodeRunHistoryRow
                            key={run.id}
                            run={run}
                            isExpanded={history.expandedIds.has(run.id)}
                            onToggle={history.toggleRow}
                            registerCaret={history.registerCaret}
                        />
                    ))}
                    <ShowAllRuns
                        isVisible={runs.length > VISIBLE_RUNS}
                        showAll={history.showAll}
                        total={runs.length}
                        onToggle={history.toggleShowAll}
                        buttonRef={history.showAllRef}
                    />
                </Stack>
            </Collapse>
        </Paper>
    )
}
