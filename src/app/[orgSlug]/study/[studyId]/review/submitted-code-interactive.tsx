'use client'

import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Collapse,
    Divider,
    Group,
    Loader,
    Menu,
    Skeleton,
    Stack,
    Text,
    Typography,
    UnstyledButton,
} from '@mantine/core'
import { CaretRightIcon, DownloadSimpleIcon, EyeIcon } from '@phosphor-icons/react/dist/ssr'
import { ToggleChevron } from '@/components/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { isActionError } from '@/lib/errors'
import { CodeViewer, ImageViewer } from '@/components/file-viewers'
import { FilePreviewModal } from '@/components/modals/file-preview-modal'
import { decodeFileContents, imageMimeType } from '@/lib/file-content-helpers'
import { highlightLanguageForFile } from '@/lib/languages'
import { SCAN_LOG_FILE_NAME, scanLogDownloadURL, studyCodeURL } from '@/lib/paths'
import {
    fetchScanLogAction,
    fetchStudyJobCodeFileAction,
    getJobAnalysisAction,
    regenerateStudyReviewAction,
} from '@/server/actions/study-job.actions'
import type { JobAnalysis, JobScanResult, StudyReviewWithMeta } from '@/server/db/queries'
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

const AI_SUMMARY_COLLAPSED_LINE_CLAMP = 2

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

const ANALYSIS_POLL_INTERVAL_MS = 5_000

// Backstop for a generation that hangs without throwing; a real failure persists summaryFailedAt.
// Measured from submission, not page open, so opening late does not reset the clock.
const AI_SUMMARY_TIMEOUT_MS = 180_000

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

// A resubmit reuses the job id, so keying on it alone lets the cache serve the previous round as
// current — the same defect the server-side round rule closes, reintroduced on the client by a 60s
// staleTime over a singleton query client (OTTER-775 review).
const jobAnalysisKey = (studyJobId: string, submittedAt: Date | string) =>
    ['job-analysis', studyJobId, new Date(submittedAt).getTime()] as const

// The summary and the scan describe the same submission and land at different times, so one query
// feeds both panels. The server drops a review belonging to a previous round, so a null review here
// means "generating", never "last round's" (OTTER-775).
//
// The backstops deliberately do not appear here: they decide what a panel renders, not whether the
// poll runs. 8.4% of measured generations finish past the summary backstop, and stopping there
// stranded a report that was already in the database until a reload (OTTER-775 review).
function useJobAnalysisPoll(studyJobId: string, submittedAt: Date | string, initial: JobAnalysis, intervalMs: number) {
    // Holds the scan once it has reported, so later ticks can tell the server not to re-read it. A
    // ref rather than the cache because the shared useQuery wrapper's queryFn takes no context.
    const settledScan = useRef<JobScanResult | null>(isScanPending(initial.scan) ? null : initial.scan)

    return useQuery({
        queryKey: jobAnalysisKey(studyJobId, submittedAt),
        queryFn: async () => {
            const held = settledScan.current
            const response = await getJobAnalysisAction({ studyJobId, scanSettled: held != null })
            if (isActionError(response)) return response

            // A null scan means "unchanged": the server skipped the re-read because we said we
            // already had it, so the value we held is the one to keep.
            const scan = response.scan ?? held ?? initial.scan
            if (!isScanPending(scan)) settledScan.current = scan
            return { review: response.review, scan }
        },
        initialData: initial,
        // The server render is already stale by the time it reaches the browser; without this the
        // seeded value counts as fresh and the first interval tick is skipped.
        initialDataUpdatedAt: 0,
        refetchInterval: (query) => {
            if (query.state.error) return false
            const data = query.state.data
            return data?.review == null || isScanPending(data?.scan) ? intervalMs : false
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
                Generating summary
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

function useRetryStudyReview(studyJobId: string, analysisKey: readonly unknown[], onRetryStarted: () => void) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => regenerateStudyReviewAction({ studyJobId }),
        onSuccess: () => {
            // Must be the poll's own key, round included, or this clears an entry nothing reads and
            // the panel keeps rendering the failure it just retried.
            // Clears only the review half; the scan in the same payload is unaffected by a regen.
            queryClient.setQueryData(analysisKey, (prev: JobAnalysis | undefined) =>
                prev ? { ...prev, review: null } : prev,
            )
            onRetryStarted()
        },
    })
}

type AiSummaryProps = {
    studyJobId: string
    analysisKey: readonly unknown[]
    review: StudyReviewWithMeta | null
    hasError: boolean
    timedOut: boolean
    onRetryStarted: () => void
}

function AiSummaryCollapsible({ studyJobId, analysisKey, review, hasError, timedOut, onRetryStarted }: AiSummaryProps) {
    const { isExpanded, toggle } = useAiSummaryToggle()
    const retry = useRetryStudyReview(studyJobId, analysisKey, onRetryStarted)
    const summary = review?.report?.codeExplanation ?? null

    const onRetry = () => retry.mutate()
    const errorState = <AiSummaryError onRetry={onRetry} isRetrying={retry.isPending} />

    // A summary already on screen outranks a failed poll tick: the poll keeps running for the scan
    // long after the report lands, and a late failure must not replace good content the reviewer is
    // reading — it never came back, because an error stops the poll (OTTER-775 review).
    const renderBody = () => {
        if (review != null) {
            if (review.summaryFailedAt != null) return errorState
            if (!summary) return <AiSummaryEmpty />
            return <AiSummaryContent summary={summary} isExpanded={isExpanded} onToggle={toggle} />
        }
        if (hasError || timedOut) return errorState
        return <AiSummaryPending />
    }

    return (
        <Stack gap="lg" data-testid="ai-summary">
            <Stack gap={4}>
                <Text fw={700} fz={16}>
                    AI Summary of submitted code files
                </Text>
                <Text size="xs" c="dimmed">
                    AI-generated summary, which may contain errors. Review the submitted code before making your
                    decision.
                </Text>
            </Stack>
            {renderBody()}
        </Stack>
    )
}

export type JobAnalysisPanelsProps = {
    studyJobId: string
    initialAnalysis: JobAnalysis
    // Anchors both backstops so opening the page late does not restart either clock.
    submittedAt: Date | string
    // Overridable so tests can exercise the backstops and polling without faking timers.
    summaryTimeoutMs?: number
    scanTimeoutMs?: number
    pollIntervalMs?: number
    detailsExpanded?: boolean
    // Sibling of the details Collapse so a closed panel does not leave flex-gap above the toggle.
    expandToggle?: ReactNode
    children?: ReactNode
}

function JobAnalysisExtendedDetails({
    isVisible,
    expandToggle,
    children,
}: {
    isVisible: boolean
    expandToggle?: ReactNode
    children: ReactNode
}) {
    return (
        <Stack gap={0}>
            {expandToggle}
            <Collapse in={isVisible} keepMounted>
                {children}
            </Collapse>
        </Stack>
    )
}

// Owns the single poll both panels read from; each renders its own pending/timeout state off it.
export function JobAnalysisPanels({
    studyJobId,
    initialAnalysis,
    submittedAt,
    summaryTimeoutMs = AI_SUMMARY_TIMEOUT_MS,
    scanTimeoutMs = SCAN_TIMEOUT_MS,
    pollIntervalMs = ANALYSIS_POLL_INTERVAL_MS,
    detailsExpanded = true,
    expandToggle,
    children,
}: JobAnalysisPanelsProps) {
    const summaryTimeout = useElapsedSince(submittedAt, summaryTimeoutMs)
    const scanTimeout = useElapsedSince(submittedAt, scanTimeoutMs)
    const { data, error } = useJobAnalysisPoll(studyJobId, submittedAt, initialAnalysis, pollIntervalMs)
    const analysis = data ?? initialAnalysis
    const isScanWaiting = isScanPending(analysis.scan)
    // Only the clock decides the scan will not report. A failed request is transient and gets its
    // own state, since the enclave run it knows nothing about is usually still going.
    const scanGivenUp = scanTimeout.elapsed && isScanWaiting

    return (
        <Stack gap="xl">
            <SecurityScanLog
                studyJobId={studyJobId}
                scan={analysis.scan}
                givenUp={scanGivenUp}
                isUnreachable={error != null && isScanWaiting}
            />
            <JobAnalysisExtendedDetails isVisible={detailsExpanded} expandToggle={expandToggle}>
                <Stack gap="xl">
                    <Divider />
                    <AiSummaryCollapsible
                        studyJobId={studyJobId}
                        analysisKey={jobAnalysisKey(studyJobId, submittedAt)}
                        review={analysis.review}
                        hasError={error != null}
                        timedOut={summaryTimeout.elapsed}
                        onRetryStarted={summaryTimeout.reset}
                    />
                    {children}
                </Stack>
            </JobAnalysisExtendedDetails>
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

function CodeFilesHeading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text fw={700} fz={16}>
            Code files
        </Text>
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
    // When set, the parent owns expand/collapse and the toggle becomes the closer for the
    // AI summary and code files.
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
                <CodeFilesHeading isVisible={expanded} />
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
    fw: 700,
    display: 'inline-flex',
    style: { alignItems: 'center', gap: 4, width: 'fit-content' },
} as const

const SCAN_LOG_ACTION_ICON_SIZE = 14

// View opens the shared file viewer modal; Download goes straight to the signed S3 URL, so the
// two paths stay independent — the log stays downloadable even when the in-app fetch fails.
function ScanLogActions({ studyJobId, isVisible }: { studyJobId: string; isVisible: boolean }) {
    const viewer = useScanLogViewer(studyJobId)
    if (!isVisible) return null

    const file = viewer.isOpen ? { name: SCAN_LOG_FILE_NAME, contents: viewer.contents } : null

    return (
        <Group gap={4}>
            <Anchor
                component="button"
                type="button"
                onClick={viewer.open}
                data-testid="security-scan-log-view"
                {...SCAN_LOG_LINK_PROPS}
            >
                <EyeIcon size={SCAN_LOG_ACTION_ICON_SIZE} />
                View
            </Anchor>
            <Anchor
                href={scanLogDownloadURL(studyJobId)}
                download
                data-testid="security-scan-log-download"
                {...SCAN_LOG_LINK_PROPS}
            >
                <DownloadSimpleIcon size={SCAN_LOG_ACTION_ICON_SIZE} />
                Download scan log
            </Anchor>
            <FilePreviewModal file={file} onClose={viewer.close} />
        </Group>
    )
}

type ScanRowProps = {
    label: string
    description: string
    testId: string
}

function ScanRow({ label, description, testId }: ScanRowProps) {
    return (
        <Group gap="sm" align="center" data-testid={testId}>
            <Text size="sm" fw={600}>
                {label}
            </Text>
            <Text size="xs" c="dimmed">
                {description}
            </Text>
        </Group>
    )
}

function ScanLogBody() {
    return (
        <Stack gap="sm">
            <ScanRow
                label="Trivy filesystem scan:"
                description="Scans the code for exposed secrets."
                testId="security-scan-trivy"
            />
            <ScanRow
                label="SonarQube quality gate:"
                description="Scans Python code for risky patterns and security issues like hard-coded credentials or injection risks. R code is not currently scanned."
                testId="security-scan-sonarqube"
            />
        </Stack>
    )
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

// Deliberately not ScanTimedOut's wording: a failed request says nothing about the enclave run,
// which is usually still going. Only the clock may claim the scan will not report.
function ScanUnreachable() {
    return (
        <Text size="sm" c="dimmed" data-testid="security-scan-unreachable">
            Could not check the scan status. Refresh the page to try again.
        </Text>
    )
}

type SecurityScanLogProps = {
    studyJobId: string
    scan: JobScanResult
    givenUp: boolean
    isUnreachable: boolean
}

function SecurityScanLog({ studyJobId, scan, givenUp, isUnreachable }: SecurityScanLogProps) {
    const renderBody = () => {
        if (givenUp) return <ScanTimedOut />
        if (isUnreachable) return <ScanUnreachable />
        return <ScanLogBody />
    }

    return (
        <Stack gap="md" data-testid="security-scan-log">
            <Stack gap={4}>
                <Text fw={700} fz={16}>
                    Security scan log
                </Text>
                <Text size="xs" c="dimmed">
                    Automated scans check code for certain vulnerabilities. Scan coverage varies by programming language
                    (R code is not scanned by Sonarqube). Not a substitute for independent review.
                </Text>
            </Stack>
            {renderBody()}
            <ScanLogActions studyJobId={studyJobId} isVisible={scan.logFile != null} />
        </Stack>
    )
}
