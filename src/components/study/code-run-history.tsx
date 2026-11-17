'use client'

import {
    ActionIcon,
    Alert,
    Badge,
    Collapse,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
    UnstyledButton,
} from '@mantine/core'
import { useDisclosure, useReducedMotion } from '@mantine/hooks'
import { DownloadSimpleIcon, LockIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react'
import { useQueryClient } from '@/common'
import { captureError } from '@/components/errors'
import { ToggleChevron } from '@/components/icons'
import { PoliteStatus, useAnnouncement } from '@/components/polite-status'
import { CodeRunSectionTitle } from '@/components/study/code-run-card'
import { CodeRunFeedback } from '@/components/study/code-run-feedback'
import { CodeRunTitle } from '@/components/study/code-run-title'
import { CollapseToggleLink } from '@/components/study/collapse-toggle-link'
import { LostKeyPopover } from '@/components/study/lost-key-popover'
import { OutputsFilesViewer } from '@/components/study/outputs-files-viewer'
import { SecurityKeyFields } from '@/components/study/security-key-fields'
import { SecurityKeyInput } from '@/components/study/security-key-input'
import { SecurityKeyViewButton } from '@/components/study/security-key-view-button'
import { encryptedFilesQuery, SECURITY_KEY_ERRORS } from '@/components/study/use-security-key-form'
import {
    ARCHIVE_INTEGRITY_MESSAGE,
    ArchiveIntegrityError,
    decryptJobFiles,
    fingerprintOfPrivateKey,
} from '@/hooks/use-decrypt-files'
import { APP_SHELL } from '@/lib/constants'
import { formatInstant } from '@/lib/dates'
import { isFeedbackOnlyRun, researcherRunDate } from '@/lib/outputs-review'
import { studyCodeURL } from '@/lib/paths'
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

// The reviewer (data partner) and the researcher (research lab) share this history; the role picks
// how a run's outputs are fetched and what an expanded row holds.
export type CodeRunRole = 'reviewer' | 'researcher'

async function decryptPriorRun(
    queryClient: ReturnType<typeof useQueryClient>,
    jobId: string,
    privateKey: string,
    role: CodeRunRole,
): Promise<RunOutputs> {
    let fingerprint: string | undefined
    if (role === 'researcher') {
        try {
            fingerprint = await fingerprintOfPrivateKey(privateKey)
        } catch {
            return { status: 'wrong-key' }
        }
    }
    let encryptedFiles
    try {
        encryptedFiles = await queryClient.fetchQuery(encryptedFilesQuery(jobId, role, fingerprint))
    } catch {
        return { status: 'fetch-failed' }
    }
    // A researcher is sent only the wraps for the key entered, so nothing back means it is not a recipient.
    if (!encryptedFiles.length) return { status: role === 'researcher' ? 'wrong-key' : 'no-files' }

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

const countOutputs = (results: RunOutputs[], ...statuses: RunOutputs['status'][]) =>
    results.filter((outputs) => statuses.includes(outputs.status)).length

const unopenedRunsSentences = (results: RunOutputs[]): string[] => {
    const needKey = countOutputs(results, 'wrong-key')
    const failed = countOutputs(results, 'integrity', 'fetch-failed')
    return [
        needKey ? `${needKey} previous ${needKey === 1 ? 'run needs' : 'runs need'} a different key.` : '',
        failed ? `${failed} previous ${failed === 1 ? 'run' : 'runs'} could not be opened.` : '',
    ]
}

const joinSentences = (sentences: string[]) => sentences.filter(Boolean).join(' ')

// One message for the latest run and every earlier run it tried, rather than one per row.
export function decryptedSummary(results: RunOutputs[]): string {
    return joinSentences(['Outputs decrypted.', ...unopenedRunsSentences(results)])
}

// The history's own key opens only earlier runs, so the message counts them rather than claiming
// the latest run was decrypted.
export function historyKeySummary(results: RunOutputs[]): string {
    const opened = countOutputs(results, 'unlocked')
    return joinSentences([
        `Outputs decrypted for ${opened} previous ${opened === 1 ? 'run' : 'runs'}.`,
        ...unopenedRunsSentences(results),
    ])
}

type KeyAttemptOutcome = 'accepted' | 'wrong-key' | 'integrity' | 'fetch-failed'

// One opened run proves the key. Otherwise a failed fetch proves nothing about it, so it is not
// reported as a wrong key.
export function keyAttemptOutcome(results: RunOutputs[]): KeyAttemptOutcome {
    const has = (status: RunOutputs['status']) => results.some((outputs) => outputs.status === status)
    if (has('unlocked')) return 'accepted'
    if (has('integrity')) return 'integrity'
    if (has('fetch-failed')) return 'fetch-failed'
    return 'wrong-key'
}

// Decrypts are not awaited by their caller, so one can land after the page is gone.
function useIsMounted() {
    const isMounted = useRef(false)
    useEffect(() => {
        isMounted.current = true
        return () => {
            isMounted.current = false
        }
    }, [])
    return isMounted
}

// Earlier runs are tried with the key that opened the latest one while it is in hand, then the key
// is dropped: it is only ever an argument here, never state, a ref or storage.
export function usePriorRunOutputs(runs: PriorCodeRun[], role: CodeRunRole = 'reviewer') {
    const queryClient = useQueryClient()
    const [byRun, setByRun] = useState<Record<string, RunOutputs>>({})
    const [announcement, announce] = useAnnouncement()
    const isMounted = useIsMounted()
    const setRun = (runId: string, outputs: RunOutputs) => {
        if (isMounted.current) setByRun((current) => ({ ...current, [runId]: outputs }))
    }
    const sharedRuns = () => runs.filter((run) => !isFeedbackOnlyRun(run.statusChanges))

    return {
        byRun,
        announcement,
        decryptWith: (privateKey: string) => {
            const shared = sharedRuns()
            setByRun(Object.fromEntries(shared.map((run) => [run.id, { status: 'decrypting' } as const])))
            const decrypts = shared.map((run) =>
                decryptPriorRun(queryClient, run.id, privateKey, role).then((outputs) => {
                    setRun(run.id, outputs)
                    return outputs
                }),
            )
            void Promise.all(decrypts).then((results) => {
                if (isMounted.current) announce(decryptedSummary(results))
            })
        },
        // Writes nothing, so no row shows a result until the caller knows whether the key opened any.
        tryKey: async (privateKey: string): Promise<Record<string, RunOutputs>> => {
            const shared = sharedRuns()
            const results = await Promise.all(
                shared.map((run) => decryptPriorRun(queryClient, run.id, privateKey, role)),
            )
            return Object.fromEntries(shared.map((run, index) => [run.id, results[index]]))
        },
        commit: (results: Record<string, RunOutputs>) => {
            if (isMounted.current) setByRun((current) => ({ ...current, ...results }))
        },
        unlockRun: (runId: string, files: JobFileInfo[]) => setRun(runId, { status: 'unlocked', files }),
    }
}

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

// The research lab sees a run once the reviewer decides on it, so its rows use that date, the same
// one its latest run's card shows.
const runDate = (run: PriorCodeRun, role: CodeRunRole): Date | null => {
    if (role === 'reviewer') return run.ranAt
    const decidedAt = researcherRunDate(run.statusChanges)
    return decidedAt ? new Date(decidedAt) : null
}

// Hide and View less only change what is shown; what the user opened and typed lives here so it
// comes back, and is lost on refresh or navigation because it is never written to storage.
function useCodeRunHistory(runs: PriorCodeRun[], role: CodeRunRole, outputs: PriorRunOutputs | undefined) {
    const [isOpen, { toggle }] = useDisclosure(false)
    const [showAll, setShowAll] = useState(false)
    const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set())
    const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
    const [historyKeyDraft, setHistoryKeyDraft] = useState('')
    const [historyKeyAccepted, setHistoryKeyAccepted] = useState(false)
    const [announcement, announce] = useAnnouncement()
    // The row whose own key just opened it, so its table takes focus once. Any later toggle clears
    // it: a remounted table (a row reopened, or on Mantine 9 a section shown again) must not take it.
    const [focusRunId, setFocusRunId] = useState<string | null>(null)
    const toggleRefs = useRef(new Map<string, HTMLButtonElement>())
    const showAllRef = useRef<HTMLButtonElement>(null)
    const titleRef = useRef<HTMLHeadingElement>(null)
    const movesFocus = useRef(false)
    const reduceMotion = useReducedMotion() ?? false

    // The rows View all runs reveals only exist after the render it causes. View less shortens the
    // list under the reviewer, so the section title is scrolled back into view after focus moves.
    useEffect(() => {
        if (!movesFocus.current) return
        movesFocus.current = false
        if (showAll) {
            toggleRefs.current.get(runs[VISIBLE_RUNS]?.id)?.focus()
            return
        }
        showAllRef.current?.focus()
        revealRow(titleRef.current, false, reduceMotion)
    }, [showAll, runs, reduceMotion])

    // The accepted key's input unmounts under the user, so focus goes to the section it opened.
    useEffect(() => {
        if (historyKeyAccepted) titleRef.current?.focus()
    }, [historyKeyAccepted])

    return {
        isOpen,
        toggle: () => {
            announce('')
            setFocusRunId(null)
            toggle()
        },
        announcement,
        focusRunId,
        announceUnlocked: (runId: string) => {
            const run = runs.find((candidate) => candidate.id === runId)
            setFocusRunId(runId)
            if (run) announce(`Outputs decrypted for Code run ${formatInstant(runDate(run, role))}.`)
        },
        historyKeyDraft,
        setHistoryKeyDraft,
        historyKeyAccepted,
        // Rows change only once the key has opened at least one run, so none shows a result early.
        attemptHistoryKey: async (privateKey: string): Promise<KeyAttemptOutcome> => {
            if (!outputs) return 'fetch-failed'
            const results = await outputs.tryKey(privateKey)
            const outcome = keyAttemptOutcome(Object.values(results))
            if (outcome !== 'accepted') return outcome
            outputs.commit(results)
            setHistoryKeyAccepted(true)
            setHistoryKeyDraft('')
            announce(historyKeySummary(Object.values(results)))
            return outcome
        },
        showAll,
        visibleRuns: showAll ? runs : runs.slice(0, VISIBLE_RUNS),
        keyDrafts,
        setKeyDraft: (id: string, value: string) => setKeyDrafts((current) => ({ ...current, [id]: value })),
        expandedIds,
        showAllRef,
        titleRef,
        // Focus lands on one row, which says nothing about how many runs the list now holds.
        toggleShowAll: () => {
            movesFocus.current = true
            setFocusRunId(null)
            announce(
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
    role: CodeRunRole
    outputs: RunOutputs | undefined
    /** True once a key that applies to the history was accepted: the latest run's, or the history's own. */
    keyGiven: boolean
    onUnlocked: (runId: string, files: JobFileInfo[]) => void
    keyDraft: string
    onKeyDraftChange: (runId: string, value: string) => void
    /** True right after this row's own key opened it, so its table takes focus. */
    isFocusTarget: boolean
}

type RowOutputsView = 'locked' | 'decrypting' | 'unlocked' | 'needs-key' | 'integrity' | 'no-files' | 'fetch-failed'

// One view per row, so a row can never show the lock and a result at once.
function rowOutputsView(outputs: RunOutputs | undefined, keyGiven: boolean): RowOutputsView {
    if (!keyGiven) return 'locked'
    if (!outputs || outputs.status === 'wrong-key') return 'needs-key'
    return outputs.status
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

const WrongKeyAlert: FC<{ children: string }> = ({ children }) => {
    return (
        // Static on purpose: the user opened this row, so nothing needs announcing. Mantine's Alert
        // would otherwise be role="alert", which a screen reader reads out as soon as it appears.
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

const KEY_ATTEMPT_ERRORS: Record<Exclude<KeyAttemptOutcome, 'accepted'>, string> = {
    'wrong-key': SECURITY_KEY_ERRORS.invalid,
    integrity: SECURITY_KEY_ERRORS.integrity,
    'fetch-failed': SECURITY_KEY_ERRORS.fetchFailed,
}

type KeyAttemptOptions = {
    value: string
    onValueChange: (value: string) => void
    attempt: (privateKey: string) => Promise<KeyAttemptOutcome>
}

// A key form for a set of runs rather than one job's archives. The key is only ever an argument to
// `attempt`; the typed text is held by the caller so it survives Hide and View less. Takes the input
// ref instead of returning it: a hook result that carries a ref cannot be read during render.
function useKeyAttempt(
    { value, onValueChange, attempt }: KeyAttemptOptions,
    inputRef: RefObject<HTMLTextAreaElement | null>,
) {
    const [error, setError] = useState<string>()
    const [isPending, setIsPending] = useState(false)
    const pending = useRef(false)

    // The input is disabled while a key is tried, so focus can only return once it is enabled again.
    useEffect(() => {
        if (error && !isPending) inputRef.current?.focus()
    }, [error, isPending, inputRef])

    const submit = async () => {
        if (pending.current) return
        const trimmed = value.trim()
        if (!trimmed) {
            setError(SECURITY_KEY_ERRORS.empty)
            inputRef.current?.focus()
            return
        }
        pending.current = true
        setIsPending(true)
        setError(undefined)
        let outcome: KeyAttemptOutcome
        try {
            outcome = await attempt(trimmed)
        } catch {
            outcome = 'fetch-failed'
        }
        pending.current = false
        // No mount check: Hide keeps this form in an Activity, which runs effect cleanups but keeps
        // state, so a skipped update would leave the form disabled when the history opens again.
        setIsPending(false)
        if (outcome !== 'accepted') setError(KEY_ATTEMPT_ERRORS[outcome])
    }

    return {
        error,
        isPending,
        onChange: (next: string) => {
            onValueChange(next)
            setError(undefined)
        },
        submit,
    }
}

type KeyAttemptFieldsProps = KeyAttemptOptions & {
    label: ReactNode
    description?: string
    withLostKeyHelp: boolean
}

const KeyAttemptFields: FC<KeyAttemptFieldsProps> = ({ label, description, withLostKeyHelp, ...options }) => {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const { error, isPending, onChange, submit } = useKeyAttempt(options, inputRef)
    return (
        <>
            <SecurityKeyInput
                ref={inputRef}
                label={label}
                description={description}
                autoFocus={false}
                placeholder="Enter your security key"
                value={options.value}
                onChange={(event) => onChange(event.currentTarget.value)}
                error={error}
                disabled={isPending}
            />
            <SecurityKeyViewButton isDecrypting={isPending} idleLabel="View files" onClick={() => void submit()} />
            <LostKeyPopover isVisible={withLostKeyHelp} />
        </>
    )
}

type HistoryKeyEntryProps = KeyAttemptOptions & { isVisible: boolean }

// When the latest run shared feedback only, no key was entered above, so earlier runs that shared
// outputs are opened from here.
const HistoryKeyEntry: FC<HistoryKeyEntryProps> = ({ isVisible, ...options }) => {
    if (!isVisible) return null
    return (
        <Paper withBorder p="lg" data-testid="code-run-history-key">
            <Stack gap="md">
                <KeyAttemptFields
                    {...options}
                    label="Security key"
                    description="Output files are encrypted. Enter your security key to access outputs from previous code runs."
                    withLostKeyHelp
                />
            </Stack>
        </Paper>
    )
}

const RunKeyLabel: FC<{ run: PriorCodeRun; role: CodeRunRole }> = ({ run, role }) => (
    <>
        Security key for <CodeRunTitle value={runDate(run, role)} />
    </>
)

const ReviewerRunKeyFields: FC<RowOutputsProps & { isVisible: boolean }> = ({
    isVisible,
    run,
    role,
    onUnlocked,
    keyDraft,
    onKeyDraftChange,
}) => {
    if (!isVisible) return null
    return (
        <SecurityKeyFields
            job={run}
            type="reviewer"
            buttonLabel="View files"
            label={<RunKeyLabel run={run} role={role} />}
            autoFocus={false}
            withLostKeyHelp={false}
            value={keyDraft}
            onValueChange={(value) => onKeyDraftChange(run.id, value)}
            onDecrypted={(files) => onUnlocked(run.id, files)}
        />
    )
}

// A researcher's run is fetched by the fingerprint of the key entered, so a run shared for an
// earlier key opens with that key.
const ResearcherRunKeyFields: FC<RowOutputsProps & { isVisible: boolean }> = ({ isVisible, ...props }) => {
    if (!isVisible) return null
    return <ResearcherRunKeyAttempt {...props} />
}

function useResearcherRunKeyAttempt(runId: string, onUnlocked: RowOutputsProps['onUnlocked']) {
    const queryClient = useQueryClient()
    return async (privateKey: string) => {
        const outputs = await decryptPriorRun(queryClient, runId, privateKey, 'researcher')
        if (outputs.status === 'unlocked') onUnlocked(runId, outputs.files)
        return keyAttemptOutcome([outputs])
    }
}

const ResearcherRunKeyAttempt: FC<RowOutputsProps> = ({ run, role, onUnlocked, keyDraft, onKeyDraftChange }) => {
    const attempt = useResearcherRunKeyAttempt(run.id, onUnlocked)
    return (
        <KeyAttemptFields
            label={<RunKeyLabel run={run} role={role} />}
            withLostKeyHelp={false}
            value={keyDraft}
            onValueChange={(value) => onKeyDraftChange(run.id, value)}
            attempt={attempt}
        />
    )
}

// A run whose outputs need a key of their own: one the key above did not open, or every run when
// the latest run had nothing to decrypt and so no key was entered above.
const RunKeyEntry: FC<RowOutputsProps & { isVisible: boolean }> = ({ isVisible, ...props }) => {
    if (!isVisible) return null
    return (
        <Stack gap="md">
            <WrongKeyAlert>
                This run’s outputs were encrypted with your previous security key. Enter that key to view them.
            </WrongKeyAlert>
            <ReviewerRunKeyFields {...props} isVisible={props.role === 'reviewer'} />
            <ResearcherRunKeyFields {...props} isVisible={props.role === 'researcher'} />
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

type UnlockedOutputsProps = {
    isVisible: boolean
    jobId: string
    outputs: RunOutputs | undefined
    isFocusTarget: boolean
}

const UnlockedOutputs: FC<UnlockedOutputsProps> = ({ isVisible, jobId, outputs, isFocusTarget }) => {
    if (!isVisible || outputs?.status !== 'unlocked') return null
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

// The unlocked table carries its own "Output files" title and Download all button.
const OutputsTitle: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <CodeRunSectionTitle>Output files</CodeRunSectionTitle>
}

const RunOutputsSection: FC<RowOutputsProps & { isVisible: boolean }> = ({ isVisible, ...props }) => {
    if (!isVisible) return null
    const view = rowOutputsView(props.outputs, props.keyGiven)

    return (
        <Stack gap="md">
            <OutputsTitle isVisible={view !== 'unlocked'} />
            <LockedOutputs isVisible={view === 'locked'} />
            <DecryptingLoader isVisible={view === 'decrypting'} />
            <UnlockedOutputs
                isVisible={view === 'unlocked'}
                jobId={props.run.id}
                outputs={props.outputs}
                isFocusTarget={props.isFocusTarget}
            />
            <RunKeyEntry {...props} isVisible={view === 'needs-key'} />
            <RunOutputsMessage isVisible={view === 'integrity'}>{ARCHIVE_INTEGRITY_MESSAGE}</RunOutputsMessage>
            <RunOutputsMessage isVisible={view === 'no-files'}>This run produced no output files.</RunOutputsMessage>
            <RunOutputsMessage isVisible={view === 'fetch-failed'}>
                This run’s outputs could not be loaded. Refresh the page to try again.
            </RunOutputsMessage>
        </Stack>
    )
}

const FeedbackOnlyOutputs: FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return (
        <Stack gap="md">
            <OutputsTitle isVisible />
            <RunOutputsMessage isVisible>Output files were not shared for this run.</RunOutputsMessage>
        </Stack>
    )
}

const CodeFileRow: FC<{ jobId: string; name: string }> = ({ jobId, name }) => (
    <Table.Tr>
        <Table.Td>{name}</Table.Td>
        <Table.Td>
            <Tooltip label="Download" events={{ hover: true, focus: true, touch: true }}>
                <ActionIcon
                    variant="subtle"
                    color="grey"
                    aria-label={`Download ${name}`}
                    onClick={() => window.open(studyCodeURL(jobId, name))}
                >
                    <DownloadSimpleIcon size={20} />
                </ActionIcon>
            </Tooltip>
        </Table.Td>
    </Table.Tr>
)

const CodeFilesTable: FC<{ jobId: string; files: PriorCodeRun['codeFiles'] }> = ({ jobId, files }) => {
    if (!files.length) {
        return (
            <Text fz="sm" c={semanticColor('text.secondary')}>
                No code files were uploaded.
            </Text>
        )
    }
    return (
        <Table>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>File name</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {files.map((file) => (
                    <CodeFileRow key={file.id} jobId={jobId} name={file.name} />
                ))}
            </Table.Tbody>
        </Table>
    )
}

// A resubmission replaces a job's code files, so these are the files this run executed. Download
// is the only action: the run is history, nothing in it can change.
const RunCodeFiles: FC<{ isVisible: boolean; run: PriorCodeRun }> = ({ isVisible, run }) => {
    if (!isVisible) return null
    return (
        <Stack gap="md" data-testid="code-run-history-code-files">
            <Text fz="lg" fw={fontWeight.bold} c={semanticColor('text.primary')}>
                Code files v{run.round}
            </Text>
            <CodeFilesTable jobId={run.id} files={run.codeFiles} />
        </Stack>
    )
}

// Mounted only while the row is open, so a closed row neither fetches its archives nor relies on
// Collapse keeping it alive (it unmounts when reduced motion is on).
const RowBody: FC<RowOutputsProps & { isVisible: boolean }> = ({ isVisible, ...props }) => {
    if (!isVisible) return null
    const isFeedbackOnly = isFeedbackOnlyRun(props.run.statusChanges)
    return (
        <Stack gap="lg" pt="lg" data-testid="code-run-history-row-body">
            <Divider />
            <RunCodeFiles isVisible={props.role === 'researcher'} run={props.run} />
            <FeedbackOnlyOutputs isVisible={isFeedbackOnly} />
            <RunOutputsSection {...props} isVisible={!isFeedbackOnly} />
            <CodeRunFeedback feedback={props.run.feedback} />
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
    role,
    outputs,
    keyGiven,
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
                                <CodeRunTitle value={runDate(run, role)} />
                            </span>
                            <RunBadges id={badgesId} labels={codeRunBadges(run.statusChanges)} />
                        </Group>
                        <ToggleChevron isExpanded={isExpanded} openTo="down" />
                    </Group>
                </UnstyledButton>
            </Title>
            <Collapse expanded={isExpanded} id={bodyId}>
                <RowBody
                    isVisible={isExpanded}
                    run={run}
                    role={role}
                    outputs={outputs[run.id]}
                    keyGiven={keyGiven}
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
    /** Researcher rows list their code files, open with the researcher's keys and are dated by the decision. */
    role?: CodeRunRole
    /** From usePriorRunOutputs, owned by the page so the latest run's key form can feed it. */
    outputs?: PriorRunOutputs
    /** True once the latest run is decrypted, or when it has nothing that a key entered above could open. */
    isLatestDecrypted?: boolean
    /** A key input above the rows, for when the latest run shared feedback only and an earlier one shared outputs. */
    withHistoryKey?: boolean
}

const NO_OUTPUTS: PriorRunOutputs['byRun'] = {}

// `runs` never holds the latest run, which has its own card above; with no earlier runs there is
// no history to show.
export const CodeRunHistory: FC<CodeRunHistoryProps> = ({
    runs,
    role = 'reviewer',
    outputs,
    isLatestDecrypted = false,
    withHistoryKey = false,
}) => {
    const { titleRef, ...history } = useCodeRunHistory(runs, role, outputs)
    const listId = useId()
    const keyGiven = isLatestDecrypted || history.historyKeyAccepted

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
                <Title
                    ref={titleRef}
                    order={3}
                    tabIndex={-1}
                    fz="md"
                    fw={fontWeight.regular}
                    c={semanticColor('text.secondary')}
                >
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
            <PoliteStatus announcement={history.announcement} />
            <Collapse expanded={history.isOpen} id={listId}>
                <Stack gap="md" pt="lg">
                    <HistoryKeyEntry
                        isVisible={withHistoryKey && !history.historyKeyAccepted}
                        value={history.historyKeyDraft}
                        onValueChange={history.setHistoryKeyDraft}
                        attempt={history.attemptHistoryKey}
                    />
                    {history.visibleRuns.map((run) => (
                        <CodeRunHistoryRow
                            key={run.id}
                            run={run}
                            role={role}
                            outputs={outputs?.byRun ?? NO_OUTPUTS}
                            keyGiven={keyGiven}
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
