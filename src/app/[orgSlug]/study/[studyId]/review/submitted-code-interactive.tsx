'use client'

import { fontWeight, semanticColor } from '@/theme/tokens'
import {
    ActionIcon,
    Alert,
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
import { CaretRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import clsx from 'clsx'
import { AnalysisPanel, ExpandableDetails } from './analysis-panel'
import { SecurityScanPanel, isScanPending } from './security-scan-panel'
import { useEffect, useState, type ReactNode } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { isActionError } from '@/lib/errors'
import { STUDY_REVIEW_STALE_AFTER_MS, studyReviewState } from '@/lib/study-review'
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

// The feedback editor's list classes (globals.css), so summary lists indent like reviewer feedback
// rather than with Typography's wider defaults.
const MARKDOWN_LIST_COMPONENTS: Components = {
    ul: ({ node: _node, className, ...props }) => <ul className={clsx('editable-text-ul', className)} {...props} />,
    ol: ({ node: _node, className, ...props }) => <ol className={clsx('editable-text-ol', className)} {...props} />,
}

function AiSummaryContent({ summary }: { summary: string }) {
    return (
        <ExpandableDetails testId="ai-summary" showLabel="View full AI summary" hideLabel="Hide full AI summary">
            <Typography fz="sm">
                <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_LIST_COMPONENTS}>
                    {summary}
                </Markdown>
            </Typography>
        </ExpandableDetails>
    )
}

const ANALYSIS_POLL_INTERVAL_MS = 5_000

// Only for a round with no row yet: queued, or a run that died before it could claim anything.
// Measured from submission, not page open, so opening late does not reset the clock.
const AI_SUMMARY_TIMEOUT_MS = STUDY_REVIEW_STALE_AFTER_MS

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

type JobAnalysisUpdate = JobAnalysis

// The server drops a review belonging to a previous round, so a null review here means
// "generating", never "last round's" (OTTER-775).
//
// The backstops deliberately do not appear here: they decide what a panel renders, not whether the
// poll runs. 8.4% of measured generations finish past the summary backstop, and stopping there
// stranded a report that was already in the database until a reload (OTTER-775 review).
function useJobAnalysisPoll(
    studyJobId: string,
    submittedAt: Date | string,
    initialAnalysis: JobAnalysis,
    intervalMs: number,
) {
    return useQuery({
        queryKey: jobAnalysisKey(studyJobId, submittedAt),
        queryFn: async (): Promise<JobAnalysisUpdate> => {
            const response = await getJobAnalysisAction({ studyJobId })
            if (isActionError(response)) throw new Error('Unable to load analysis')
            return response
        },
        initialData: initialAnalysis,
        // The server render is already stale by the time it reaches the browser; without this the
        // seeded value counts as fresh and the first interval tick is skipped.
        initialDataUpdatedAt: 0,
        refetchInterval: (query) => {
            if (query.state.error) return false
            const review = query.state.data?.review
            return review == null || studyReviewState(review) === 'pending' || isScanPending(query.state.data?.scan)
                ? intervalMs
                : false
        },
    })
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

function useRetryStudyReview(studyJobId: string, analysisKey: readonly unknown[], onRetryStarted: () => void) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => regenerateStudyReviewAction({ studyJobId }),
        onSuccess: (result) => {
            // The server refuses to restart a run that is still alive, and there is nothing to
            // restart for a report that has already landed. Either way the row on screen is the
            // one to re-read, and the clock it is judged against must not move.
            if (isActionError(result) || result.status !== 'restarted') {
                queryClient.invalidateQueries({ queryKey: [...analysisKey] })
                return
            }
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
    const retry = useRetryStudyReview(studyJobId, analysisKey, onRetryStarted)
    const summary = review?.report?.codeExplanation ?? null

    const onRetry = () => retry.mutate()
    const errorState = <AiSummaryError onRetry={onRetry} isRetrying={retry.isPending} />

    // A summary already on screen outranks a failed tick: a failure stops the poll, so replacing
    // good content the reviewer is reading would never come back (OTTER-775 review).
    const renderBody = () => {
        if (review != null) {
            const state = studyReviewState(review)
            if (state === 'failed') return errorState
            // An error stops the poll, so a run still pending when one lands has nothing left to
            // report its own outcome to this page. Offering the retry beats a spinner that can no
            // longer resolve, and unlike a landed report there is nothing here worth protecting.
            if (state === 'pending') return timedOut || hasError ? errorState : <AiSummaryPending />
            if (!summary) return <AiSummaryEmpty />
            return <AiSummaryContent summary={summary} />
        }
        if (hasError || timedOut) return errorState
        return <AiSummaryPending />
    }

    return (
        <AnalysisPanel
            title="AI Summary of submitted code files"
            description="AI-generated summary, which may contain errors. Review the submitted code before making your decision."
            testId="ai-summary"
        >
            {renderBody()}
        </AnalysisPanel>
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
    expandToggle?: ReactNode
    // Blocks above the scan and summary; they count toward the collapsed preview.
    leadingBlocks?: SubmissionDetailBlock[]
    children: ReactNode
}

// The collapsed section previews whatever blocks come first, so adding, removing or reordering a
// block never needs a change here (OTTER-865).
const SUBMISSION_DETAILS_PREVIEW_COUNT = 2

export type SubmissionDetailBlock = {
    key: string
    isVisible?: boolean
    alwaysCollapsed?: boolean
    content: ReactNode
}

export function splitPreviewBlocks(blocks: SubmissionDetailBlock[], previewCount: number) {
    const shown = blocks.filter((block) => block.isVisible !== false)
    const preview = shown.filter((block) => !block.alwaysCollapsed).slice(0, previewCount)
    return { preview, rest: shown.filter((block) => !preview.includes(block)) }
}

function BlockDivider({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return <Divider />
}

function DetailBlockRow({ content, withDivider }: { content: ReactNode; withDivider: boolean }) {
    return (
        <>
            <BlockDivider isVisible={withDivider} />
            {content}
        </>
    )
}

function DividedBlocks({ blocks }: { blocks: SubmissionDetailBlock[] }) {
    return blocks.map((block, index) => (
        <DetailBlockRow key={block.key} content={block.content} withDivider={index > 0} />
    ))
}

function CollapsibleRest({
    isVisible,
    blocks,
    expanded,
    expandToggle,
}: {
    isVisible: boolean
    blocks: SubmissionDetailBlock[]
    expanded: boolean
    expandToggle?: ReactNode
}) {
    if (!isVisible) return null
    // The toggle is a sibling of the Collapse so a closed panel does not leave flex-gap above it.
    return (
        <>
            <Divider />
            <Stack gap={0}>
                {expandToggle}
                <Collapse in={expanded} keepMounted>
                    <Stack gap="xl">
                        <DividedBlocks blocks={blocks} />
                    </Stack>
                </Collapse>
            </Stack>
        </>
    )
}

function SubmissionDetailBlocks({
    blocks,
    detailsExpanded,
    expandToggle,
}: {
    blocks: SubmissionDetailBlock[]
    detailsExpanded: boolean
    expandToggle?: ReactNode
}) {
    const { preview, rest } = splitPreviewBlocks(blocks, SUBMISSION_DETAILS_PREVIEW_COUNT)
    // Figma sets the divider above the collapsed opener tighter (lg) than the gap between blocks (xl).
    return (
        <Stack gap={detailsExpanded ? 'xl' : 'lg'}>
            <Stack gap="xl">
                <DividedBlocks blocks={preview} />
            </Stack>
            <CollapsibleRest
                isVisible={rest.length > 0}
                blocks={rest}
                expanded={detailsExpanded}
                expandToggle={expandToggle}
            />
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
    leadingBlocks = [],
    children,
}: JobAnalysisPanelsProps) {
    const summaryTimeout = useElapsedSince(submittedAt, summaryTimeoutMs)
    const { data, error } = useJobAnalysisPoll(studyJobId, submittedAt, initialAnalysis, pollIntervalMs)
    const review = data?.review ?? null
    // The server judges a row it has; the submission clock only covers a run that never wrote one.
    const summaryGaveUp = review ? review.isStale : summaryTimeout.elapsed

    const blocks: SubmissionDetailBlock[] = [
        ...leadingBlocks,
        { key: 'security-scan', content: <SecurityScanPanel scan={data?.scan ?? null} hasError={error != null} /> },
        {
            key: 'ai-summary',
            content: (
                <AiSummaryCollapsible
                    studyJobId={studyJobId}
                    analysisKey={jobAnalysisKey(studyJobId, submittedAt)}
                    review={review}
                    hasError={error != null}
                    timedOut={summaryGaveUp}
                    onRetryStarted={summaryTimeout.reset}
                />
            ),
        },
        // The code viewer holds the section's closer, so it must never land in the preview.
        { key: 'code-files', alwaysCollapsed: true, content: children },
    ]

    return <SubmissionDetailBlocks blocks={blocks} detailsExpanded={detailsExpanded} expandToggle={expandToggle} />
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
            bg={isActive ? semanticColor('surface.selected') : undefined}
            pr="xs"
        >
            <UnstyledButton
                onClick={onClick}
                data-testid="study-code-file-tab"
                data-active={isActive ? 'true' : 'false'}
                title={file.name}
                pl="md"
                pr="xs"
                py="xs"
            >
                <Text
                    size="sm"
                    component="span"
                    c={isActive ? semanticColor('text.white') : semanticColor('text.secondary')}
                    fw={fontWeight.regular}
                    className="nowrap"
                >
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
                <UnstyledButton data-testid="study-code-files-overflow" px="md" py="xs">
                    <Group gap="xxs" wrap="nowrap" align="center">
                        <Text size="sm" c={semanticColor('text.secondary')} component="span" className="nowrap">
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
        <Text fw={fontWeight.bold} fz="md">
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
        <Group gap="sm" wrap="nowrap" className="clip" data-testid="study-code-file-tabs">
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
            <DownloadSimpleIcon
                weight="fill"
                color={isActive ? semanticColor('text.white') : semanticColor('icon.dark')}
            />
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
