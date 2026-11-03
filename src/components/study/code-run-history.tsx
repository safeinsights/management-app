'use client'

import { ActionIcon, Alert, Badge, Collapse, Divider, Group, Loader, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure, useReducedMotion } from '@mantine/hooks'
import { LockIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@/common'
import { ToggleChevron } from '@/components/icons'
import { LocalDateTime } from '@/components/local-date-time'
import { CollapseToggleLink } from '@/components/study/collapse-toggle-link'
import { FeedbackEntries } from '@/components/study/feedback-and-notes'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import { ARCHIVE_INTEGRITY_MESSAGE, ArchiveIntegrityError, decryptJobFiles } from '@/hooks/use-decrypt-files'
import type { JobFileInfo } from '@/lib/types'
import { actionResult } from '@/lib/utils'
import { fetchEncryptedJobFilesAction } from '@/server/actions/study-job.actions'
import { fontWeight, semanticColor } from '@/theme/tokens'
import type { PriorCodeRun } from '@/server/db/queries'

const VISIBLE_RUNS = 3

// How much of an opened row must show below its header: enough to see what it holds, never all of it.
const CONTENT_PEEK_PX = 160

export type RunOutputs =
    | { status: 'decrypting' }
    | { status: 'unlocked'; files: JobFileInfo[] }
    | { status: 'wrong-key' }
    | { status: 'integrity' }
    | { status: 'no-files' }

async function decryptPriorRun(
    queryClient: ReturnType<typeof useQueryClient>,
    jobId: string,
    privateKey: string,
): Promise<RunOutputs> {
    try {
        // The same key as the row's own key form, so a wrong-key row reuses this fetch.
        const encryptedFiles = await queryClient.fetchQuery({
            queryKey: ['encrypted-files', jobId, 'reviewer'],
            queryFn: async () => actionResult(await fetchEncryptedJobFilesAction({ jobId, type: 'reviewer' })),
        })
        if (!encryptedFiles.length) return { status: 'no-files' }
        const files = await decryptJobFiles(encryptedFiles, privateKey, jobId)
        return files.length ? { status: 'unlocked', files } : { status: 'wrong-key' }
    } catch (err) {
        return err instanceof ArchiveIntegrityError ? { status: 'integrity' } : { status: 'wrong-key' }
    }
}

// Earlier runs are tried with the key that opened the latest one while it is in hand, then the key
// is dropped: it is only ever an argument here, never state, a ref or storage.
export function usePriorRunOutputs(runs: PriorCodeRun[]) {
    const queryClient = useQueryClient()
    const [byRun, setByRun] = useState<Record<string, RunOutputs>>({})
    const setRun = (runId: string, outputs: RunOutputs) => setByRun((current) => ({ ...current, [runId]: outputs }))

    return {
        byRun,
        decryptWith: (privateKey: string) => {
            setByRun(Object.fromEntries(runs.map((run) => [run.id, { status: 'decrypting' } as const])))
            for (const run of runs) {
                void decryptPriorRun(queryClient, run.id, privateKey).then((outputs) => setRun(run.id, outputs))
            }
        },
        unlockRun: (runId: string, files: JobFileInfo[]) => setRun(runId, { status: 'unlocked', files }),
    }
}

export type PriorRunOutputs = ReturnType<typeof usePriorRunOutputs>

// The header never moves when a row opens, so its position before the change is enough to decide.
function revealRow(header: HTMLElement | null, isOpening: boolean, reduceMotion: boolean) {
    if (!header) return
    const { top, bottom } = header.getBoundingClientRect()
    const behavior = reduceMotion ? 'auto' : 'smooth'
    if (top < 0) {
        window.scrollBy({ top, behavior })
        return
    }
    const overflow = bottom + CONTENT_PEEK_PX - window.innerHeight
    if (isOpening && overflow > 0) window.scrollBy({ top: Math.min(overflow, top), behavior })
}

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
        // Hidden rather than unmounted, so a row's unsubmitted key text survives View less.
        isRowHidden: (index: number) => !showAll && index >= VISIBLE_RUNS,
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

type RowOutputsProps = {
    run: PriorCodeRun
    outputs: RunOutputs | undefined
    isLatestDecrypted: boolean
    onUnlocked: (runId: string, files: JobFileInfo[]) => void
}

const LockedOutputs: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return (
        <Stack
            align="center"
            gap="sm"
            p="lg"
            bg={semanticColor('surface.sunken')}
            data-testid="code-run-outputs-locked"
        >
            <LockIcon size={24} aria-hidden="true" color={semanticColor('text.secondary')} />
            <Text fz="sm" c={semanticColor('text.secondary')}>
                Enter security key above to decrypt and review output files.
            </Text>
        </Stack>
    )
}

const WrongKeyAlert: FC<{ isVisible: boolean; children: string }> = ({ isVisible, children }) => {
    if (!isVisible) return null
    return (
        <Alert
            variant="light"
            radius={0}
            bg={semanticColor('warning.bg.light')}
            c={semanticColor('warning.text')}
            icon={<WarningCircleIcon size={20} weight="fill" />}
        >
            <Text fz="sm" c={semanticColor('text.primary')}>
                {children}
            </Text>
        </Alert>
    )
}

// A run whose outputs need a key of their own: one the latest key did not open, or every run when
// the latest run had nothing to decrypt and so no key was entered above.
const RunKeyEntry: FC<RowOutputsProps & { isVisible: boolean }> = ({ isVisible, run, outputs, onUnlocked }) => {
    if (!isVisible) return null
    return (
        <Stack gap="md">
            <WrongKeyAlert isVisible={outputs?.status === 'wrong-key'}>
                This run’s outputs were encrypted with your previous security key. Enter that key to view them.
            </WrongKeyAlert>
            <SecurityKeyFields
                job={run}
                type="reviewer"
                buttonLabel="View files"
                autoFocus={false}
                withLostKeyHelp={false}
                onDecrypted={(files) => onUnlocked(run.id, files)}
            />
        </Stack>
    )
}

const RunOutputsMessage: FC<{ isVisible: boolean; children: string }> = ({ isVisible, children }) => {
    if (!isVisible) return null
    return (
        <Text fz="sm" c={semanticColor('text.secondary')}>
            {children}
        </Text>
    )
}

const UnlockedOutputs: FC<{ jobId: string; outputs: RunOutputs | undefined }> = ({ jobId, outputs }) => {
    if (outputs?.status !== 'unlocked') return null
    return <OutputsFilesViewer jobId={jobId} decryptedFiles={outputs.files} variant="embedded" />
}

const DecryptingLoader: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <Loader size="sm" aria-label="Decrypting outputs" />
}

const needsOwnKey = (outputs: RunOutputs | undefined) => !outputs || outputs.status === 'wrong-key'

// The unlocked table carries its own "Output files" title and Download all button.
const OutputsTitle: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return (
        <Text fz="lg" fw={fontWeight.bold} c={semanticColor('text.primary')}>
            Output files
        </Text>
    )
}

const RunOutputsSection: FC<RowOutputsProps> = (props) => {
    const { run, outputs, isLatestDecrypted } = props
    const status = outputs?.status

    return (
        <Stack gap="md">
            <OutputsTitle isVisible={status !== 'unlocked'} />
            <LockedOutputs isVisible={!isLatestDecrypted} />
            <DecryptingLoader isVisible={isLatestDecrypted && status === 'decrypting'} />
            <UnlockedOutputs jobId={run.id} outputs={outputs} />
            <RunKeyEntry {...props} isVisible={isLatestDecrypted && needsOwnKey(outputs)} />
            <RunOutputsMessage isVisible={isLatestDecrypted && status === 'integrity'}>
                {ARCHIVE_INTEGRITY_MESSAGE}
            </RunOutputsMessage>
            <RunOutputsMessage isVisible={isLatestDecrypted && status === 'no-files'}>
                This run produced no output files.
            </RunOutputsMessage>
        </Stack>
    )
}

// Outputs decisions are the only feedback a run carries, so each reads as reviewer feedback.
const asFeedbackEntries = (feedback: PriorCodeRun['feedback']) =>
    feedback.map((entry) => ({ ...entry, entryType: 'REVIEWER-FEEDBACK' }))

const RunFeedback: FC<{ feedback: PriorCodeRun['feedback'] }> = ({ feedback }) => {
    if (feedback.length === 0) return null
    return <FeedbackEntries entries={asFeedbackEntries(feedback)} alwaysExpandLatest testId="code-run-feedback" />
}

type CodeRunHistoryRowProps = Omit<RowOutputsProps, 'outputs'> & {
    outputs: PriorRunOutputs['byRun']
    isHidden: boolean
    isExpanded: boolean
    onToggle: (id: string) => void
    registerCaret: (id: string, element: HTMLButtonElement | null) => void
}

const CodeRunHistoryRow: FC<CodeRunHistoryRowProps> = ({
    run,
    outputs,
    isLatestDecrypted,
    onUnlocked,
    isHidden,
    isExpanded,
    onToggle,
    registerCaret,
}) => {
    const titleId = useId()
    const bodyId = useId()
    const headerRef = useRef<HTMLDivElement>(null)
    const reduceMotion = useReducedMotion() ?? false

    const toggle = () => {
        revealRow(headerRef.current, !isExpanded, reduceMotion)
        onToggle(run.id)
    }

    return (
        <Paper withBorder p="lg" hidden={isHidden} data-testid="code-run-history-row">
            <Group ref={headerRef} justify="space-between" wrap="nowrap">
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
                    onClick={toggle}
                    aria-labelledby={titleId}
                    aria-expanded={isExpanded}
                    aria-controls={bodyId}
                >
                    <ToggleChevron isExpanded={isExpanded} />
                </ActionIcon>
            </Group>
            <Collapse in={isExpanded} id={bodyId}>
                <Stack gap="lg" pt="lg" data-testid="code-run-history-row-body">
                    <Divider />
                    <RunOutputsSection
                        run={run}
                        outputs={outputs[run.id]}
                        isLatestDecrypted={isLatestDecrypted}
                        onUnlocked={onUnlocked}
                    />
                    <RunFeedback feedback={run.feedback} />
                </Stack>
            </Collapse>
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

type CodeRunHistoryProps = {
    runs: PriorCodeRun[]
    /** From usePriorRunOutputs, owned by the page so the latest run's key form can feed it. */
    outputs?: PriorRunOutputs
    /** True once the latest run is decrypted, or when it had nothing to decrypt. */
    isLatestDecrypted?: boolean
}

const NO_OUTPUTS: PriorRunOutputs['byRun'] = {}
const noop = () => {}

// `runs` never holds the latest run, which has its own card above; with no earlier runs there is
// no history to show.
export const CodeRunHistory: FC<CodeRunHistoryProps> = ({ runs, outputs, isLatestDecrypted = false }) => {
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
                    {runs.map((run, index) => (
                        <CodeRunHistoryRow
                            key={run.id}
                            run={run}
                            outputs={outputs?.byRun ?? NO_OUTPUTS}
                            isLatestDecrypted={isLatestDecrypted}
                            onUnlocked={outputs?.unlockRun ?? noop}
                            isHidden={history.isRowHidden(index)}
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
