'use client'

import { fontWeight, semanticColor } from '@/theme/tokens'
import {
    ActionIcon,
    Alert,
    Anchor,
    Button,
    Collapse,
    Group,
    Loader,
    Menu,
    Skeleton,
    Stack,
    Text,
    Typography,
    UnstyledButton,
} from '@mantine/core'
import { CaretRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { ToggleChevron } from '@/components/icons'
import { useEffect, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { isActionError } from '@/lib/errors'
import { CodeViewer, ImageViewer } from '@/components/file-viewers'
import { decodeFileContents, imageMimeType } from '@/lib/file-content-helpers'
import { highlightLanguageForFile } from '@/lib/languages'
import { studyCodeURL } from '@/lib/paths'
import {
    fetchStudyJobCodeFileAction,
    getJobAnalysisAction,
    regenerateStudyReviewAction,
} from '@/server/actions/study-job.actions'
import type { JobAnalysis, StudyReviewWithMeta } from '@/server/db/queries'
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

type JobAnalysisUpdate = { review: StudyReviewWithMeta | null }

// The server drops a review belonging to a previous round, so a null review here means
// "generating", never "last round's" (OTTER-775).
//
// The backstops deliberately do not appear here: they decide what a panel renders, not whether the
// poll runs. 8.4% of measured generations finish past the summary backstop, and stopping there
// stranded a report that was already in the database until a reload (OTTER-775 review).
function useJobAnalysisPoll(
    studyJobId: string,
    submittedAt: Date | string,
    initialReview: StudyReviewWithMeta | null,
    intervalMs: number,
) {
    return useQuery({
        queryKey: jobAnalysisKey(studyJobId, submittedAt),
        // No `withScan`: this page stopped rendering a scan verdict in OTTER-694, and asking for
        // one would buy an S3 read on every tick.
        queryFn: async (): Promise<JobAnalysisUpdate> => {
            const response = await getJobAnalysisAction({ studyJobId })
            if (isActionError(response)) return { review: null }
            return { review: response.review }
        },
        initialData: { review: initialReview },
        // The server render is already stale by the time it reaches the browser; without this the
        // seeded value counts as fresh and the first interval tick is skipped.
        initialDataUpdatedAt: 0,
        refetchInterval: (query) => {
            if (query.state.error) return false
            return query.state.data?.review == null ? intervalMs : false
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
            fw={fontWeight.bold}
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
                <Text fw={fontWeight.semibold} size="sm">
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
            queryClient.setQueryData(analysisKey, (prev: JobAnalysisUpdate | undefined) =>
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

    // A summary already on screen outranks a failed tick: a failure stops the poll, so replacing
    // good content the reviewer is reading would never come back (OTTER-775 review).
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
                <Text fw={fontWeight.bold}>AI Summary of submitted code files</Text>
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
    // Anchors the summary backstop so opening the page late does not restart the clock.
    submittedAt: Date | string
    // Overridable so tests can exercise the backstop and polling without faking timers.
    summaryTimeoutMs?: number
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

// Owns the analysis poll the AI summary reads from.
export function JobAnalysisPanels({
    studyJobId,
    initialAnalysis,
    submittedAt,
    summaryTimeoutMs = AI_SUMMARY_TIMEOUT_MS,
    pollIntervalMs = ANALYSIS_POLL_INTERVAL_MS,
    detailsExpanded = true,
    expandToggle,
    children,
}: JobAnalysisPanelsProps) {
    const summaryTimeout = useElapsedSince(submittedAt, summaryTimeoutMs)
    const { data, error } = useJobAnalysisPoll(studyJobId, submittedAt, initialAnalysis.review, pollIntervalMs)

    return (
        <JobAnalysisExtendedDetails isVisible={detailsExpanded} expandToggle={expandToggle}>
            <Stack gap="xl">
                <AiSummaryCollapsible
                    studyJobId={studyJobId}
                    analysisKey={jobAnalysisKey(studyJobId, submittedAt)}
                    review={data?.review ?? null}
                    hasError={error != null}
                    timedOut={summaryTimeout.elapsed}
                    onRetryStarted={summaryTimeout.reset}
                />
                {children}
            </Stack>
        </JobAnalysisExtendedDetails>
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
                <Text size="sm" component="span" c={isActive ? 'white' : 'charcoal.7'} fw={fontWeight.regular}>
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
                    <Group gap="xxs" wrap="nowrap" align="center" style={{ whiteSpace: 'nowrap' }}>
                        <Text size="sm" c={semanticColor('text.secondary')} component="span">
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
