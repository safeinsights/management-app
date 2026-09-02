'use client'

import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Group,
    Loader,
    Menu,
    Skeleton,
    Stack,
    Text,
    Typography,
    UnstyledButton,
} from '@mantine/core'
import { CaretRightIcon, DownloadSimpleIcon, EyeIcon, WarningCircle } from '@phosphor-icons/react/dist/ssr'
import { ToggleChevron } from '@/components/icons'
import { useEffect, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { CodeViewer, ImageViewer } from '@/components/file-viewers'
import { FilePreviewModal } from '@/components/modals/file-preview-modal'
import { decodeFileContents, imageMimeType } from '@/lib/file-content-helpers'
import { highlightLanguageForFile } from '@/lib/languages'
import { SCAN_LOG_FILE_NAME, scanLogDownloadURL, studyCodeURL } from '@/lib/paths'
import {
    fetchScanLogAction,
    fetchStudyJobCodeFileAction,
    getJobScanResultAction,
    getStudyReviewAction,
    regenerateStudyReviewAction,
} from '@/server/actions/study-job.actions'
import type { JobScanResult, ScanToolStatus, StudyReviewWithMeta } from '@/server/db/queries'
import type { CodeFile } from './study-code-files'
import {
    FULL_STUDY_CODE_TOGGLE_LABELS,
    StudyCodeToggle,
    type StudyCodeToggleLabels,
} from '@/app/[orgSlug]/study/[studyId]/view/study-code-collapse'

export type { CodeFile } from './study-code-files'

const MAX_TAB_CHARS = 22
const MAX_VISIBLE_TABS_BEFORE_OVERFLOW = 4

export function truncateFileName(name: string, max = MAX_TAB_CHARS): string {
    if (name.length <= max) return name
    return name.slice(0, max - 1) + '…'
}

export function splitVisibleFiles(files: CodeFile[]) {
    if (files.length <= MAX_VISIBLE_TABS_BEFORE_OVERFLOW) {
        return { visible: files, hidden: [] as CodeFile[], hiddenCount: 0 }
    }
    const visibleSlots = MAX_VISIBLE_TABS_BEFORE_OVERFLOW - 1
    const hidden = files.slice(visibleSlots)
    return { visible: files.slice(0, visibleSlots), hidden, hiddenCount: hidden.length }
}

function useAiSummaryToggle() {
    const [isExpanded, setIsExpanded] = useState(false)
    return { isExpanded, toggle: () => setIsExpanded((v) => !v) }
}

const AI_SUMMARY_COLLAPSED_LINE_CLAMP = 3

// Panda's preflight zeroes list-style globally, so restore markers explicitly.
const MARKDOWN_LIST_COMPONENTS: Components = {
    ul: ({ node: _node, ...props }) => (
        <ul style={{ listStyleType: 'disc', paddingLeft: '1.5em', margin: '0.25em 0' }} {...props} />
    ),
    ol: ({ node: _node, ...props }) => (
        <ol style={{ listStyleType: 'decimal', paddingLeft: '1.5em', margin: '0.25em 0' }} {...props} />
    ),
}

function AiSummaryBody({ isExpanded, summary }: { isExpanded: boolean; summary: string }) {
    return (
        <Text
            component="div"
            size="sm"
            data-testid="ai-summary-body"
            lineClamp={isExpanded ? undefined : AI_SUMMARY_COLLAPSED_LINE_CLAMP}
        >
            <Typography fz="sm">
                <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_LIST_COMPONENTS}>
                    {summary}
                </Markdown>
            </Typography>
        </Text>
    )
}

const REVIEW_POLL_INTERVAL_MS = 5_000

// Backstop for a generation that hangs without throwing; a real failure persists summaryFailedAt.
// Measured from submission, not page open, so opening late does not reset the clock.
const AI_SUMMARY_TIMEOUT_MS = 180_000

// `since` is read once on mount and later prop changes are ignored, so a new submission must
// arrive via a fresh server render or an explicit reset().
function useElapsedSince(since: Date | string, ms: number) {
    const initialSinceMs = new Date(since).getTime()
    const [startedAt, setStartedAt] = useState(initialSinceMs)
    const [elapsed, setElapsed] = useState(() => Date.now() - initialSinceMs >= ms)
    useEffect(() => {
        const remaining = Math.max(0, ms - (Date.now() - startedAt))
        const id = setTimeout(() => setElapsed(true), remaining)
        return () => clearTimeout(id)
    }, [startedAt, ms])
    return {
        elapsed,
        reset: () => {
            setStartedAt(Date.now())
            setElapsed(false)
        },
    }
}

// A change-requested resubmit reuses the job, so the row for last round's code sits under the same
// query key. attachCodeToRoundJob deletes it, which is what makes createdAt trustworthy here: the
// replacement is a fresh insert, never a rename that carries the old timestamp forward (OTTER-775).
function isReviewForCurrentRound(review: StudyReviewWithMeta | null | undefined, submittedAt: Date | string) {
    if (!review) return false
    // A failure row is only ever written by this round's generation attempt, and it can land in the
    // same millisecond as the submission, so it is trusted without the timestamp comparison.
    if (review.summaryFailedAt != null) return true
    return new Date(review.createdAt).getTime() >= new Date(submittedAt).getTime()
}

function useStudyReviewPoll(studyJobId: string, initialReview: StudyReviewWithMeta | null, submittedAt: Date | string) {
    return useQuery({
        queryKey: ['study-review', studyJobId],
        queryFn: () => getStudyReviewAction({ studyJobId }),
        initialData: initialReview,
        // The server render is already stale by the time it reaches the browser; without this the
        // seeded value counts as fresh and the first interval tick is skipped (OTTER-775).
        initialDataUpdatedAt: 0,
        refetchInterval: (query) => {
            if (query.state.error) return false
            return isReviewForCurrentRound(query.state.data, submittedAt) ? false : REVIEW_POLL_INTERVAL_MS
        },
    })
}

function AiSummaryToggle({ isExpanded, onToggle }: { isExpanded: boolean; onToggle: () => void }) {
    const toggleLabel = isExpanded ? 'Hide full AI summary' : 'View full AI summary'
    return (
        <Anchor
            component="button"
            type="button"
            onClick={onToggle}
            size="sm"
            fw={700}
            display="inline-flex"
            w="fit-content"
            style={{ alignItems: 'center', gap: 4 }}
            data-testid="ai-summary-toggle"
            aria-expanded={isExpanded}
        >
            {toggleLabel}
            <ToggleChevron isExpanded={isExpanded} />
        </Anchor>
    )
}

function AiSummaryPending() {
    return (
        <Group gap="xs" data-testid="ai-summary-pending">
            <Loader size="sm" />
            <Text c="dimmed" size="sm">
                AI Summary is loading
            </Text>
        </Group>
    )
}

function AiSummaryError({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
    return (
        <Alert color="red" data-testid="ai-summary-error">
            <Group justify="space-between" gap="sm" wrap="nowrap">
                <Text size="sm">The AI summary failed to generate.</Text>
                <Button
                    size="compact-sm"
                    variant="white"
                    color="red"
                    onClick={onRetry}
                    loading={isRetrying}
                    data-testid="ai-summary-retry"
                >
                    Retry
                </Button>
            </Group>
        </Alert>
    )
}

function AiSummaryEmpty() {
    return (
        <Text size="sm" c="dimmed" data-testid="ai-summary-empty">
            No AI summary available yet.
        </Text>
    )
}

type AiSummaryContentProps = { summary: string; isExpanded: boolean; onToggle: () => void }

function AiSummaryContent({ summary, isExpanded, onToggle }: AiSummaryContentProps) {
    return (
        <>
            <Stack gap="xs">
                <Text fw={600} size="sm">
                    Overview
                </Text>
                <AiSummaryBody isExpanded={isExpanded} summary={summary} />
            </Stack>
            <AiSummaryToggle isExpanded={isExpanded} onToggle={onToggle} />
        </>
    )
}

function useRetryStudyReview(studyJobId: string, onRetryStarted: () => void) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => regenerateStudyReviewAction({ studyJobId }),
        onSuccess: () => {
            queryClient.setQueryData(['study-review', studyJobId], null)
            onRetryStarted()
        },
    })
}

type AiSummaryProps = {
    studyJobId: string
    initialReview: StudyReviewWithMeta | null
    // Anchors the stuck-generation backstop so opening the page late does not restart the clock.
    submittedAt: Date | string
    // Both overridable so tests can exercise polling and the backstop without faking timers.
    timeoutMs?: number
    pollIntervalMs?: number
}

export function AiSummaryCollapsible({
    studyJobId,
    initialReview,
    submittedAt,
    timeoutMs = AI_SUMMARY_TIMEOUT_MS,
}: AiSummaryProps) {
    const { isExpanded, toggle } = useAiSummaryToggle()
    const { data, error } = useStudyReviewPoll(studyJobId, initialReview, submittedAt)
    // Last round's summary must not stand in for this one while the new report is generating.
    const review = isReviewForCurrentRound(data, submittedAt) ? data : null
    const timeout = useElapsedSince(submittedAt, timeoutMs)
    const retry = useRetryStudyReview(studyJobId, timeout.reset)
    const timedOut = timeout.elapsed
    const summary = review?.report?.codeExplanation ?? null

    const onRetry = () => retry.mutate()
    const errorState = <AiSummaryError onRetry={onRetry} isRetrying={retry.isPending} />

    const renderBody = () => {
        if (error != null) return errorState
        if (review != null) {
            if (review.summaryFailedAt != null) return errorState
            if (!summary) return <AiSummaryEmpty />
            return <AiSummaryContent summary={summary} isExpanded={isExpanded} onToggle={toggle} />
        }
        if (timedOut) return errorState
        return <AiSummaryPending />
    }

    return (
        <Stack gap="lg" data-testid="ai-summary">
            <Text fw={700}>AI Summary: Analysis of all files</Text>
            {renderBody()}
        </Stack>
    )
}

function useStudyCodeViewer(files: CodeFile[], initialExpanded: boolean) {
    const [activeFileName, setActiveFileName] = useState<string | null>(files[0]?.name ?? null)
    const [isExpanded, setIsExpanded] = useState(initialExpanded)
    const activeFile = files.find((f) => f.name === activeFileName) ?? files[0] ?? null
    return {
        activeFile,
        selectFile: setActiveFileName,
        isExpanded,
        toggleExpanded: () => setIsExpanded((v) => !v),
    }
}

function FileTab({
    file,
    isActive,
    onClick,
    studyJobId,
}: {
    file: CodeFile
    isActive: boolean
    onClick: () => void
    studyJobId: string
}) {
    const display = truncateFileName(file.name)
    return (
        <Group
            gap={0}
            wrap="nowrap"
            align="center"
            style={{
                backgroundColor: isActive ? 'var(--mantine-color-blue-7)' : 'transparent',
                borderRadius: 0,
                whiteSpace: 'nowrap',
                paddingRight: 6,
            }}
        >
            <UnstyledButton
                onClick={onClick}
                data-testid="study-code-file-tab"
                data-active={isActive ? 'true' : 'false'}
                title={file.name}
                pl="md"
                pr="xs"
                py="xs"
                style={{ whiteSpace: 'nowrap' }}
            >
                <Text size="sm" component="span" c={isActive ? 'white' : 'charcoal.7'} fw={400}>
                    {display}
                </Text>
            </UnstyledButton>
            <CodeFileDownloadButton studyJobId={studyJobId} fileName={file.name} isActive={isActive} />
        </Group>
    )
}

function OverflowFilesMenu({
    hidden,
    activeFileName,
    onSelect,
    studyJobId,
}: {
    hidden: CodeFile[]
    activeFileName: string | null
    onSelect: (name: string) => void
    studyJobId: string
}) {
    if (hidden.length === 0) return null
    const items = hidden.map((file) => (
        <Menu.Item
            key={file.name}
            onClick={() => onSelect(file.name)}
            data-testid="study-code-files-overflow-item"
            data-selected={file.name === activeFileName ? 'true' : 'false'}
            title={file.name}
            rightSection={<CodeFileDownloadButton studyJobId={studyJobId} fileName={file.name} />}
        >
            <Text size="sm" component="span">
                {truncateFileName(file.name)}
            </Text>
        </Menu.Item>
    ))
    return (
        <Menu position="bottom-start" withinPortal shadow="md">
            <Menu.Target>
                <UnstyledButton
                    data-testid="study-code-files-overflow"
                    px="md"
                    py="xs"
                    style={{ borderRadius: 0, whiteSpace: 'nowrap' }}
                >
                    <Group gap={4} wrap="nowrap" align="center" style={{ whiteSpace: 'nowrap' }}>
                        <Text size="sm" c="charcoal.7" component="span">
                            +{hidden.length} more files
                        </Text>
                        <CaretRightIcon size={12} weight="bold" />
                    </Group>
                </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown data-testid="study-code-files-overflow-menu">{items}</Menu.Dropdown>
        </Menu>
    )
}

function FileTabsRow({
    isVisible,
    visible,
    activeFileName,
    onSelect,
    hidden,
    studyJobId,
}: {
    isVisible: boolean
    visible: CodeFile[]
    activeFileName: string | null
    onSelect: (name: string) => void
    hidden: CodeFile[]
    studyJobId: string
}) {
    if (!isVisible) return null
    const tabs = visible.map((file) => (
        <FileTab
            key={file.name}
            file={file}
            isActive={file.name === activeFileName}
            onClick={() => onSelect(file.name)}
            studyJobId={studyJobId}
        />
    ))

    return (
        <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }} data-testid="study-code-file-tabs">
            {tabs}
            <OverflowFilesMenu
                hidden={hidden}
                activeFileName={activeFileName}
                onSelect={onSelect}
                studyJobId={studyJobId}
            />
        </Group>
    )
}

function useStudyCodeFileContents(studyJobId: string, fileName: string | null) {
    return useQuery({
        queryKey: ['study-job-code-file', studyJobId, fileName],
        queryFn: () => fetchStudyJobCodeFileAction({ studyJobId, fileName: fileName as string }),
        enabled: !!fileName,
        staleTime: Infinity,
    })
}

// stopPropagation: in the overflow menu this icon sits inside a selectable row.
function CodeFileDownloadButton({
    studyJobId,
    fileName,
    isActive = false,
}: {
    studyJobId: string
    fileName: string
    isActive?: boolean
}) {
    return (
        <ActionIcon
            component="a"
            href={studyCodeURL(studyJobId, fileName)}
            download={fileName}
            onClick={(e) => e.stopPropagation()}
            variant="transparent"
            size="sm"
            aria-label={`Download ${fileName}`}
            data-testid="study-code-download"
        >
            <DownloadSimpleIcon weight="fill" color={isActive ? 'white' : 'var(--mantine-color-charcoal-7)'} />
        </ActionIcon>
    )
}

function StudyCodeBody({
    isVisible,
    activeFile,
    studyJobId,
}: {
    isVisible: boolean
    activeFile: CodeFile | null
    studyJobId: string
}) {
    const { data, isLoading, isError } = useStudyCodeFileContents(studyJobId, activeFile?.name ?? null)

    if (!isVisible) return null
    if (!activeFile) {
        return (
            <Text size="sm" c="dimmed" data-testid="study-code-empty">
                No code files have been submitted yet.
            </Text>
        )
    }
    if (isLoading) {
        return <Skeleton height={240} radius="sm" data-testid="study-code-body-loading" />
    }
    if (isError || !data) {
        return (
            <Alert color="red" data-testid="study-code-body-error">
                Unable to load {activeFile.name}.
            </Alert>
        )
    }
    const mime = imageMimeType(activeFile.name)
    if (mime) {
        return (
            <div data-testid="study-code-body">
                <ImageViewer name={activeFile.name} contents={data.contents} mime={mime} />
            </div>
        )
    }

    const code = decodeFileContents(data.contents)
    return (
        <div data-testid="study-code-body">
            <CodeViewer code={code} language={highlightLanguageForFile(activeFile.name)} withBorder />
        </div>
    )
}

type StudyCodeViewerProps = {
    studyJobId: string
    files: CodeFile[]
    initialExpanded?: boolean
    toggleLabels?: StudyCodeToggleLabels
    // When set, the parent owns expand/collapse and the toggle becomes the closer for the whole
    // section.
    onCollapse?: () => void
}

export function StudyCodeViewer({
    studyJobId,
    files,
    initialExpanded = true,
    toggleLabels = FULL_STUDY_CODE_TOGGLE_LABELS,
    onCollapse,
}: StudyCodeViewerProps) {
    const { activeFile, selectFile, isExpanded, toggleExpanded } = useStudyCodeViewer(files, initialExpanded)
    const { visible, hidden } = splitVisibleFiles(files)
    const hasFiles = files.length > 0

    const expanded = onCollapse ? true : isExpanded
    const handleToggle = onCollapse ?? toggleExpanded
    const toggleTestId = onCollapse ? 'study-code-toggle-collapse' : 'study-code-toggle'
    const toggleVisible = onCollapse ? true : hasFiles

    return (
        <Stack gap="lg" data-testid="study-code-viewer">
            <Stack gap="sm">
                <FileTabsRow
                    isVisible={expanded}
                    visible={visible}
                    activeFileName={activeFile?.name ?? null}
                    onSelect={selectFile}
                    hidden={hidden}
                    studyJobId={studyJobId}
                />
                <StudyCodeBody isVisible={expanded} activeFile={activeFile} studyJobId={studyJobId} />
            </Stack>
            <StudyCodeToggle
                isVisible={toggleVisible}
                expanded={expanded}
                onClick={handleToggle}
                labels={toggleLabels}
                testId={toggleTestId}
            />
        </Stack>
    )
}

// The log is only fetched once View is clicked; a reviewer who only downloads never pays for
// pulling it through the app. A failed fetch surfaces in the modal rather than as a blank viewer.
function useScanLogViewer(studyJobId: string) {
    const [isOpen, setIsOpen] = useState(false)
    const { data, isError } = useQuery({
        queryKey: ['study-job-scan-log', studyJobId],
        queryFn: () => fetchScanLogAction({ studyJobId }),
        enabled: isOpen,
        staleTime: Infinity,
    })
    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        contents: isError ? SCAN_LOG_UNAVAILABLE : (data?.contents ?? null),
    }
}

const SCAN_LOG_UNAVAILABLE = 'Unable to load the security scan log.'

const SCAN_LOG_LINK_PROPS = {
    size: 'sm',
    fw: 600,
    display: 'inline-flex',
    style: { alignItems: 'center', gap: 4, width: 'fit-content' },
} as const

// View opens the shared file viewer modal; Download goes straight to the signed S3 URL, so the
// two paths stay independent — the log stays downloadable even when the in-app fetch fails.
function ScanLogActions({ studyJobId, isVisible }: { studyJobId: string; isVisible: boolean }) {
    const viewer = useScanLogViewer(studyJobId)
    if (!isVisible) return null

    const file = viewer.isOpen ? { name: SCAN_LOG_FILE_NAME, contents: viewer.contents } : null

    return (
        <Group gap="lg">
            <Anchor
                component="button"
                type="button"
                onClick={viewer.open}
                data-testid="security-scan-log-view"
                {...SCAN_LOG_LINK_PROPS}
            >
                <EyeIcon size={16} />
                View
            </Anchor>
            <Anchor
                href={scanLogDownloadURL(studyJobId)}
                download
                data-testid="security-scan-log-download"
                {...SCAN_LOG_LINK_PROPS}
            >
                <DownloadSimpleIcon size={16} />
                Download
            </Anchor>
            <FilePreviewModal file={file} onClose={viewer.close} />
        </Group>
    )
}
type ScanStatusLabels = Record<ScanToolStatus, string>

// "Needs review" is the card's own phrasing for the case where we cannot state an outcome with
// confidence. Trivy reaches it two ways: it examined nothing (no analyzer for R, no lockfile to
// read), or it produced no report at all. Neither is a finding and neither is a clean bill of
// health. Pending UX sign-off on whether those two should read differently to a Data Partner.
const TRIVY_LABELS: ScanStatusLabels = {
    PASSED: 'No vulnerabilities found',
    FAILED: 'Vulnerabilities found',
    INDETERMINATE: 'Needs review',
}

// SonarQube has no third label: a failing gate and an unresolvable one both need the same human look.
const SONARQUBE_LABELS: ScanStatusLabels = {
    PASSED: 'Passed',
    FAILED: 'Needs review',
    INDETERMINATE: 'Needs review',
}

// A passed row carries no icon at all. The other two are visually distinct on purpose: red reads as
// a reported problem, and an indeterminate result is not one. Amber reuses the "action needed"
// pairing the design system already applies to WarningCircle (see StatusAlert's action variant)
// rather than introducing a new treatment. Provisional along with the labels above.
const SCAN_ICON_COLORS: Partial<Record<ScanToolStatus, string>> = {
    FAILED: 'var(--mantine-color-red-9)',
    INDETERMINATE: 'var(--mantine-color-yellow-10)',
}

type ScanRowProps = {
    label: string
    status: ScanToolStatus | null
    labels: ScanStatusLabels
    testId: string
}

function ScanWarningIcon({ color }: { color?: string }) {
    if (!color) return null
    return <WarningCircle size={20} color={color} data-icon="warning" aria-hidden="true" />
}

// A tool's result: plain text when it passed, a warning icon plus the relevant phrasing when it did
// not, and a neutral pending note while the scan has not reported (status null). Deliberately no
// "pass" icon, and never a fabricated pass/fail when the status is unknown; we only flag what needs
// a human (OTTER-649).
function ScanRowValue({ status, labels }: { status: ScanToolStatus | null; labels: ScanStatusLabels }) {
    if (status === null) {
        return (
            <Text size="sm" c="dimmed">
                Scan in progress…
            </Text>
        )
    }
    return (
        <Group gap={4} wrap="nowrap" align="center">
            <ScanWarningIcon color={SCAN_ICON_COLORS[status]} />
            <Text size="sm" fw={600}>
                {labels[status]}
            </Text>
        </Group>
    )
}

function ScanRow({ label, status, labels, testId }: ScanRowProps) {
    return (
        <Group gap="xs" wrap="nowrap" align="center" data-testid={testId}>
            <Text size="sm">{label}</Text>
            <ScanRowValue status={status} labels={labels} />
        </Group>
    )
}

// The two labeled rows are always shown (the AC lists them as static elements).
// Their values come from the parsed log; when no log has been read yet, each row
// shows a pending note rather than a status.
function ScanLogBody({ scan }: { scan: JobScanResult }) {
    return (
        <Stack gap="sm">
            <ScanRow
                label="Trivy Filesystem Scan:"
                status={scan.trivy}
                labels={TRIVY_LABELS}
                testId="security-scan-trivy"
            />
            <ScanRow
                label="SonarQube Quality Gate:"
                status={scan.sonarqube}
                labels={SONARQUBE_LABELS}
                testId="security-scan-sonarqube"
            />
        </Stack>
    )
}

const SCAN_POLL_INTERVAL_MS = 5_000

// Same backstop shape as the AI summary, but a longer clock: the scan log is written by the
// enclave pipeline at the end of a run, not generated on request.
const SCAN_TIMEOUT_MS = 600_000

// Unlike the review row, this query always resolves to an object, so "still running" is both
// statuses being null rather than a missing result. A log that parsed to unknown statuses still
// reports a logFile, which is why that alone does not stop the poll.
function isScanPending(scan: JobScanResult | undefined) {
    if (!scan) return true
    return scan.trivy === null && scan.sonarqube === null
}

function useJobScanResultPoll(
    studyJobId: string,
    initialScan: JobScanResult,
    stopPolling: boolean,
    intervalMs: number,
) {
    return useQuery({
        queryKey: ['job-scan-result', studyJobId],
        queryFn: () => getJobScanResultAction({ studyJobId }),
        initialData: initialScan,
        // The server render is already stale by the time it reaches the browser; without this the
        // seeded value counts as fresh and the first interval tick is skipped.
        initialDataUpdatedAt: 0,
        refetchInterval: (query) => {
            if (query.state.error || stopPolling) return false
            return isScanPending(query.state.data) ? intervalMs : false
        },
    })
}

// There is no scan equivalent of the summary's Retry: the log comes from the enclave run, so the
// app cannot re-request one. A scan that never reports says so instead of spinning forever.
function ScanTimedOut() {
    return (
        <Text size="sm" c="dimmed" data-testid="security-scan-timeout">
            Scan results are unavailable. Refresh the page to check again.
        </Text>
    )
}

type SecurityScanLogProps = {
    studyJobId: string
    initialScan: JobScanResult
    // Anchors the backstop so opening the page late does not restart the clock.
    submittedAt: Date | string
    // Both overridable so tests can exercise polling and the backstop without faking timers.
    timeoutMs?: number
    pollIntervalMs?: number
}

export function SecurityScanLog({
    studyJobId,
    initialScan,
    submittedAt,
    timeoutMs = SCAN_TIMEOUT_MS,
    pollIntervalMs = SCAN_POLL_INTERVAL_MS,
}: SecurityScanLogProps) {
    const timeout = useElapsedSince(submittedAt, timeoutMs)
    const { data, error } = useJobScanResultPoll(studyJobId, initialScan, timeout.elapsed, pollIntervalMs)
    const scan = data ?? initialScan
    const givenUp = (timeout.elapsed || error != null) && isScanPending(scan)

    return (
        <Stack gap="lg" data-testid="security-scan-log">
            <Text fw={700} fz={16}>
                Security scan log
            </Text>
            {givenUp ? <ScanTimedOut /> : <ScanLogBody scan={scan} />}
            <ScanLogActions studyJobId={studyJobId} isVisible={scan.logFile != null} />
        </Stack>
    )
}
