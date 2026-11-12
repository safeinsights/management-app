'use client'

import {
    Alert,
    Badge,
    Collapse,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
    UnstyledButton,
    VisuallyHidden,
} from '@mantine/core'
import { useDisclosure, useReducedMotion } from '@mantine/hooks'
import { LockIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, Fragment, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@/common'
import { captureError } from '@/components/errors'
import { ToggleChevron } from '@/components/icons'
import { CodeRunTitle } from '@/components/study/code-run-title'
import { CollapseToggleLink } from '@/components/study/collapse-toggle-link'
import { FeedbackEntries } from '@/components/study/feedback-and-notes'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import { encryptedFilesQuery } from '@/components/study/use-security-key-form'
import { ARCHIVE_INTEGRITY_MESSAGE, ArchiveIntegrityError, decryptJobFiles } from '@/hooks/use-decrypt-files'
import { APP_SHELL } from '@/lib/constants'
import { formatInstant } from '@/lib/dates'
import { toOutputsFeedbackEntry } from '@/lib/outputs-review'
import type { JobFileInfo } from '@/lib/types'
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
    | { status: 'fetch-failed' }

async function decryptPriorRun(
    queryClient: ReturnType<typeof useQueryClient>,
    jobId: string,
    privateKey: string,
): Promise<RunOutputs> {
    let encryptedFiles
    try {
        encryptedFiles = await queryClient.fetchQuery(encryptedFilesQuery(jobId, 'reviewer'))
    } catch {
        return { status: 'fetch-failed' }
    }
    if (!encryptedFiles.length) return { status: 'no-files' }

    try {
        const files = await decryptJobFiles(encryptedFiles, privateKey, jobId)
        return files.length ? { status: 'unlocked', files } : { status: 'wrong-key' }
    } catch (err) {
        if (err instanceof ArchiveIntegrityError) {
            // Sent to Sentry with no toast: the row shows its own message, and this runs for every
            // earlier run when the latest one unlocks.
            captureError(err)
            return { status: 'integrity' }
        }
        return { status: 'wrong-key' }
    }
}

// One message for the latest run and every earlier run it tried, rather than one per row.
export function decryptedSummary(results: RunOutputs[]): string {
    const count = (...statuses: RunOutputs['status'][]) =>
        results.filter((outputs) => statuses.includes(outputs.status)).length
    const needKey = count('wrong-key')
    const failed = count('integrity', 'fetch-failed')
    return [
        'Outputs decrypted.',
        needKey ? `${needKey} previous ${needKey === 1 ? 'run needs' : 'runs need'} a different key.` : '',
        failed ? `${failed} previous ${failed === 1 ? 'run' : 'runs'} could not be opened.` : '',
    ]
        .filter(Boolean)
        .join(' ')
}

// Earlier runs are tried with the key that opened the latest one while it is in hand, then the key
// is dropped: it is only ever an argument here, never state, a ref or storage.
export function usePriorRunOutputs(runs: PriorCodeRun[]) {
    const queryClient = useQueryClient()
    const [byRun, setByRun] = useState<Record<string, RunOutputs>>({})
    const [announcement, setAnnouncement] = useState('')
    // Decrypts are not awaited, so one can land after the page is gone (a unit test tearing down).
    const isMounted = useRef(false)
    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
        }
    }, [])
    const setRun = (runId: string, outputs: RunOutputs) => {
        if (isMounted.current) setByRun((current) => ({ ...current, [runId]: outputs }))
    }

    return {
        byRun,
        announcement,
        decryptWith: (privateKey: string) => {
            setByRun(Object.fromEntries(runs.map((run) => [run.id, { status: 'decrypting' } as const])))
            const decrypts = runs.map((run) =>
                decryptPriorRun(queryClient, run.id, privateKey).then((outputs) => {
                    setRun(run.id, outputs)
                    return outputs
                }),
            )
            void Promise.all(decrypts).then((results) => {
                if (isMounted.current) setAnnouncement(decryptedSummary(results))
            })
        },
        unlockRun: (runId: string, files: JobFileInfo[]) => setRun(runId, { status: 'unlocked', files }),
    }
}

// A new text node per message: VoiceOver in Safari can skip text that only changes in place.
export const PoliteStatus: FC<{ message: string }> = ({ message }) => (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
        <Fragment key={message}>{message}</Fragment>
    </VisuallyHidden>
)

export type PriorRunOutputs = ReturnType<typeof usePriorRunOutputs>

// The header never moves when a row opens, so its position before the change is enough to decide.
// The window scrolls under the fixed app header, so "visible" starts below it, not at 0.
function revealRow(header: HTMLElement | null, isOpening: boolean, reduceMotion: boolean) {
    if (!header) return
    const { top, bottom } = header.getBoundingClientRect()
    const behavior = reduceMotion ? 'auto' : 'smooth'
    const visibleTop = APP_SHELL.headerHeight
    if (top < visibleTop) {
        window.scrollBy({ top: top - visibleTop, behavior })
        return
    }
    const overflow = bottom + CONTENT_PEEK_PX - window.innerHeight
    if (isOpening && overflow > 0) window.scrollBy({ top: Math.min(overflow, top - visibleTop), behavior })
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

// Hide and View less only change what is shown; what the reviewer opened and typed lives here so
// it comes back, and is lost on refresh or navigation because it is never written to storage.
function useCodeRunHistory(runs: PriorCodeRun[]) {
    const [isOpen, { toggle }] = useDisclosure(false)
    const [showAll, setShowAll] = useState(false)
    const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set())
    const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
    const [message, setMessage] = useState('')
    // The row whose own key just opened it, so its table takes focus once. Any later toggle clears
    // it: a remounted table (a row reopened, or on Mantine 9 a section shown again) must not take it.
    const [focusRunId, setFocusRunId] = useState<string | null>(null)
    const toggleRefs = useRef(new Map<string, HTMLButtonElement>())
    const showAllRef = useRef<HTMLButtonElement>(null)
    const movesFocus = useRef(false)

    // The rows View all runs reveals only exist after the render it causes.
    useEffect(() => {
        if (!movesFocus.current) return
        movesFocus.current = false
        if (showAll) toggleRefs.current.get(runs[VISIBLE_RUNS]?.id)?.focus()
        else showAllRef.current?.focus()
    }, [showAll, runs])

    return {
        isOpen,
        toggle: () => {
            setMessage('')
            setFocusRunId(null)
            toggle()
        },
        message,
        focusRunId,
        announceUnlocked: (runId: string) => {
            const run = runs.find((candidate) => candidate.id === runId)
            setFocusRunId(runId)
            if (run) setMessage(`Outputs decrypted for Code run ${formatInstant(run.ranAt)}.`)
        },
        showAll,
        visibleRuns: showAll ? runs : runs.slice(0, VISIBLE_RUNS),
        keyDrafts,
        setKeyDraft: (id: string, value: string) => setKeyDrafts((current) => ({ ...current, [id]: value })),
        expandedIds,
        showAllRef,
        // Focus lands on one row, which says nothing about how many runs the list now holds.
        toggleShowAll: () => {
            movesFocus.current = true
            setFocusRunId(null)
            setMessage(
                showAll
                    ? `Showing ${VISIBLE_RUNS} of ${runs.length} previous runs`
                    : `Showing all ${runs.length} previous runs`,
            )
            setShowAll((current) => !current)
        },
        toggleRow: (id: string) => {
            setFocusRunId(null)
            setExpandedIds((current) => {
                const next = new Set(current)
                if (!next.delete(id)) next.add(id)
                return next
            })
        },
        registerToggle: (id: string, element: HTMLButtonElement | null) => {
            if (element) toggleRefs.current.set(id, element)
            else toggleRefs.current.delete(id)
        },
    }
}

type RowOutputsProps = {
    run: PriorCodeRun
    outputs: RunOutputs | undefined
    isLatestDecrypted: boolean
    onUnlocked: (runId: string, files: JobFileInfo[]) => void
    keyDraft: string
    onKeyDraftChange: (runId: string, value: string) => void
    /** True right after this row's own key opened it, so its table takes focus. */
    isFocusTarget: boolean
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
        // Static on purpose: the reviewer opened this row, so nothing needs announcing. Mantine's
        // Alert would otherwise be role="alert", which a screen reader reads out as soon as it appears.
        <Alert
            role="note"
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
const RunKeyEntry: FC<RowOutputsProps & { isVisible: boolean }> = ({
    isVisible,
    run,
    outputs,
    onUnlocked,
    keyDraft,
    onKeyDraftChange,
}) => {
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
                label={
                    <>
                        Security key for <CodeRunTitle value={run.ranAt} />
                    </>
                }
                autoFocus={false}
                withLostKeyHelp={false}
                value={keyDraft}
                onValueChange={(value) => onKeyDraftChange(run.id, value)}
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

type UnlockedOutputsProps = { jobId: string; outputs: RunOutputs | undefined; isFocusTarget: boolean }

const UnlockedOutputs: FC<UnlockedOutputsProps> = ({ jobId, outputs, isFocusTarget }) => {
    if (outputs?.status !== 'unlocked') return null
    return (
        <OutputsFilesViewer
            jobId={jobId}
            decryptedFiles={outputs.files}
            variant="embedded"
            autoFocusTitle={isFocusTarget}
        />
    )
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
    const { run, outputs, isLatestDecrypted, isFocusTarget } = props
    const status = outputs?.status

    return (
        <Stack gap="md">
            <OutputsTitle isVisible={status !== 'unlocked'} />
            <LockedOutputs isVisible={!isLatestDecrypted} />
            <DecryptingLoader isVisible={isLatestDecrypted && status === 'decrypting'} />
            <UnlockedOutputs jobId={run.id} outputs={outputs} isFocusTarget={isFocusTarget} />
            <RunKeyEntry {...props} isVisible={isLatestDecrypted && needsOwnKey(outputs)} />
            <RunOutputsMessage isVisible={isLatestDecrypted && status === 'integrity'}>
                {ARCHIVE_INTEGRITY_MESSAGE}
            </RunOutputsMessage>
            <RunOutputsMessage isVisible={isLatestDecrypted && status === 'no-files'}>
                This run produced no output files.
            </RunOutputsMessage>
            <RunOutputsMessage isVisible={isLatestDecrypted && status === 'fetch-failed'}>
                This run’s outputs could not be loaded. Refresh the page to try again.
            </RunOutputsMessage>
        </Stack>
    )
}

// Every expanded row shows this section, so "no feedback" never reads as a failure to load it.
// Older rejections recorded the decision without a comment.
const RunFeedback: FC<{ feedback: PriorCodeRun['feedback'] }> = ({ feedback }) => {
    if (feedback.length > 0) {
        return (
            <FeedbackEntries
                entries={feedback.map(toOutputsFeedbackEntry)}
                alwaysExpandLatest
                testId="code-run-feedback"
            />
        )
    }
    return (
        <Stack gap="sm" data-testid="code-run-feedback">
            <Text fw={fontWeight.bold} fz="sm">
                Reviewer feedback
            </Text>
            <Text fz="sm" c={semanticColor('text.secondary')}>
                No feedback was shared for this run.
            </Text>
        </Stack>
    )
}

// Mounted only while the row is open, so a closed row neither fetches its archives nor relies on
// Collapse keeping it alive (it unmounts when reduced motion is on).
const RowBody: FC<RowOutputsProps & { isVisible: boolean }> = ({ isVisible, ...props }) => {
    if (!isVisible) return null
    return (
        <Stack gap="lg" pt="lg" data-testid="code-run-history-row-body">
            <Divider />
            <RunOutputsSection {...props} />
            <RunFeedback feedback={props.run.feedback} />
        </Stack>
    )
}

type CodeRunHistoryRowProps = Omit<RowOutputsProps, 'outputs'> & {
    outputs: PriorRunOutputs['byRun']
    isExpanded: boolean
    onToggle: (id: string) => void
    registerToggle: (id: string, element: HTMLButtonElement | null) => void
}

// The badges are the toggle's description, so a collapsed row is heard with its status.
const RunBadges: FC<{ id: string; labels: string[] }> = ({ id, labels }) => (
    <Group component="span" gap="sm" id={id}>
        {labels.map((label) => (
            <Badge key={label} component="span" color="grey" variant="light">
                {label}
            </Badge>
        ))}
    </Group>
)

// Accordion pattern: the heading wraps a button that spans the whole header. Mantine's Accordion
// is not used because its panel always carries role="region".
const CodeRunHistoryRow: FC<CodeRunHistoryRowProps> = ({
    run,
    outputs,
    isLatestDecrypted,
    onUnlocked,
    keyDraft,
    onKeyDraftChange,
    isFocusTarget,
    isExpanded,
    onToggle,
    registerToggle,
}) => {
    const nameId = useId()
    const badgesId = useId()
    const bodyId = useId()
    const headerRef = useRef<HTMLHeadingElement>(null)
    const reduceMotion = useReducedMotion() ?? false

    const toggle = () => {
        revealRow(headerRef.current, !isExpanded, reduceMotion)
        onToggle(run.id)
    }

    return (
        <Paper withBorder p="lg" data-testid="code-run-history-row">
            <Title ref={headerRef} order={4} fz="lg" fw={fontWeight.semibold} c={semanticColor('text.primary')}>
                <UnstyledButton
                    ref={(element) => registerToggle(run.id, element)}
                    w="100%"
                    fz="lg"
                    fw={fontWeight.semibold}
                    onClick={toggle}
                    aria-expanded={isExpanded}
                    aria-controls={bodyId}
                    aria-labelledby={nameId}
                    aria-describedby={badgesId}
                >
                    <Group component="span" justify="space-between" wrap="nowrap">
                        <Group component="span" gap="sm">
                            <span id={nameId}>
                                <CodeRunTitle value={run.ranAt} />
                            </span>
                            <RunBadges id={badgesId} labels={codeRunBadges(run.statusChanges)} />
                        </Group>
                        <ToggleChevron isExpanded={isExpanded} />
                    </Group>
                </UnstyledButton>
            </Title>
            <Collapse expanded={isExpanded} id={bodyId}>
                <RowBody
                    isVisible={isExpanded}
                    run={run}
                    outputs={outputs[run.id]}
                    isLatestDecrypted={isLatestDecrypted}
                    onUnlocked={onUnlocked}
                    keyDraft={keyDraft}
                    onKeyDraftChange={onKeyDraftChange}
                    isFocusTarget={isFocusTarget}
                />
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
                withAriaExpanded={false}
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

// `runs` never holds the latest run, which has its own card above; with no earlier runs there is
// no history to show.
export const CodeRunHistory: FC<CodeRunHistoryProps> = ({ runs, outputs, isLatestDecrypted = false }) => {
    const history = useCodeRunHistory(runs)
    const listId = useId()

    // A submitted key has done its job, so its text is not held any longer than the input needed it.
    const unlockRun = (runId: string, files: JobFileInfo[]) => {
        history.setKeyDraft(runId, '')
        history.announceUnlocked(runId)
        outputs?.unlockRun(runId, files)
    }

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
                    withAriaExpanded={false}
                    size="md"
                />
            </Group>
            <PoliteStatus message={history.message} />
            <Collapse expanded={history.isOpen} id={listId}>
                <Stack gap="md" pt="lg">
                    {history.visibleRuns.map((run) => (
                        <CodeRunHistoryRow
                            key={run.id}
                            run={run}
                            outputs={outputs?.byRun ?? NO_OUTPUTS}
                            isLatestDecrypted={isLatestDecrypted}
                            onUnlocked={unlockRun}
                            keyDraft={history.keyDrafts[run.id] ?? ''}
                            onKeyDraftChange={history.setKeyDraft}
                            isFocusTarget={history.focusRunId === run.id}
                            isExpanded={history.expandedIds.has(run.id)}
                            onToggle={history.toggleRow}
                            registerToggle={history.registerToggle}
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
