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
import { CaretRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { useEffect, useState } from 'react'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@/common'
import { CodeViewer } from '@/components/file-viewers'
import { highlightLanguageForFile } from '@/lib/languages'
import { studyCodeURL } from '@/lib/paths'
import {
    fetchStudyJobCodeFileAction,
    getStudyReviewAction,
    regenerateStudyReviewAction,
} from '@/server/actions/study-job.actions'
import type { StudyReviewWithMeta } from '@/server/db/queries'
import type { CodeFile } from './study-code-files'

export type { CodeFile } from './study-code-files'

// 20–24 char ceiling per AC; midpoint chosen so neither extreme is the boundary.
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
    // When overflowing, the last visible slot becomes the "+N more files" indicator,
    // so we keep three real tabs and roll the remainder into the overflow menu.
    const visibleSlots = MAX_VISIBLE_TABS_BEFORE_OVERFLOW - 1
    const hidden = files.slice(visibleSlots)
    return { visible: files.slice(0, visibleSlots), hidden, hiddenCount: hidden.length }
}

function useAiSummaryToggle() {
    const [isExpanded, setIsExpanded] = useState(false)
    return { isExpanded, toggle: () => setIsExpanded((v) => !v) }
}

// Collapsed, the body shows a 3-line preview of the summary; expanded shows it in full.
const AI_SUMMARY_COLLAPSED_LINE_CLAMP = 3

// Panda's preflight zeroes list-style globally, so restore markers explicitly (values match .editable-text-ul/-ol in globals.css).
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

function ToggleChevron({ isExpanded }: { isExpanded: boolean }) {
    return (
        <CaretRightIcon
            size={12}
            weight="bold"
            style={{
                transform: isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)',
                transition: 'transform 200ms ease',
            }}
        />
    )
}

const REVIEW_POLL_INTERVAL_MS = 5_000

// A genuine failure now persists a row (summaryFailedAt) and is surfaced
// immediately. This backstop only catches the rarer case where generation
// hangs without ever throwing — measured from submission, not page open, so a
// reviewer opening the page late doesn't reset the clock. 3 minutes is well
// above a normal generation; past it with no row we assume it's stuck.
const AI_SUMMARY_TIMEOUT_MS = 180_000

// Returns true once `ms` have elapsed since `since`. Used as a backstop so a
// generation that hangs without writing a (success or failure) row eventually
// surfaces as an error instead of spinning forever. `since` may be a string —
// timestamps serialize to ISO strings across the server/client boundary.
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

// The review row is written by a deferred background task triggered at code
// submission (onStudyReviewRequested). Seed with the server-fetched value and
// poll until a row lands so a reviewer who opens the page mid-generation sees
// the summary appear without a manual refresh. A row — even one with a blank
// codeExplanation — is terminal and stops the poll.
function useStudyReviewPoll(studyJobId: string, initialReview: StudyReviewWithMeta | null) {
    return useQuery({
        queryKey: ['study-review', studyJobId],
        queryFn: () => getStudyReviewAction({ studyJobId }),
        initialData: initialReview,
        refetchInterval: (query) => {
            if (query.state.error) return false
            if (query.state.data != null) return false
            return REVIEW_POLL_INTERVAL_MS
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

// Clears the failed row server-side, re-fires generation, then resets the
// cached review to null so the poll resumes and the UI drops back to pending.
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
    // When generation was requested — anchors the stuck-generation backstop so
    // opening the page late doesn't restart the clock. May arrive as an ISO
    // string once serialized across the server/client boundary.
    submittedAt: Date | string
    // Overridable so tests can exercise the backstop without faking timers.
    timeoutMs?: number
}

export function AiSummaryCollapsible({
    studyJobId,
    initialReview,
    submittedAt,
    timeoutMs = AI_SUMMARY_TIMEOUT_MS,
}: AiSummaryProps) {
    const { isExpanded, toggle } = useAiSummaryToggle()
    const { data: review, error } = useStudyReviewPoll(studyJobId, initialReview)
    // A successful retry is a new generation request, so it needs its own
    // timeout window instead of inheriting the original submission's age.
    const timeout = useElapsedSince(submittedAt, timeoutMs)
    const retry = useRetryStudyReview(studyJobId, timeout.reset)
    const timedOut = timeout.elapsed
    const summary = review?.report?.codeExplanation ?? null

    const onRetry = () => retry.mutate()
    const errorState = <AiSummaryError onRetry={onRetry} isRetrying={retry.isPending} />

    // Failure is terminal and explicit: a poll rejection, or a persisted
    // failure row (summaryFailedAt) — surfaced with a Retry. A landed success
    // row shows the summary, or the empty state for the no-API-key /
    // disabled-review placeholder path. Otherwise we're genuinely still
    // generating (spinner), with the backstop catching a silent hang.
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

// stopPropagation: in the overflow menu this icon sits inside a selectable row,
// so a download click shouldn't also switch the active file.
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
    return (
        <div data-testid="study-code-body">
            <CodeViewer code={data.contents} language={highlightLanguageForFile(activeFile.name)} withBorder />
        </div>
    )
}

export type StudyCodeToggleLabels = { expand: string; collapse: string }

const DEFAULT_STUDY_CODE_TOGGLE_LABELS: StudyCodeToggleLabels = {
    expand: 'View full study code',
    collapse: 'Hide full study code',
}

function StudyCodeToggle({
    isVisible,
    isExpanded,
    onClick,
    labels,
}: {
    isVisible: boolean
    isExpanded: boolean
    onClick: () => void
    labels: StudyCodeToggleLabels
}) {
    if (!isVisible) return null
    const label = isExpanded ? labels.collapse : labels.expand
    return (
        <Anchor
            component="button"
            type="button"
            onClick={onClick}
            size="sm"
            fw={700}
            display="inline-flex"
            w="fit-content"
            style={{ alignItems: 'center', gap: 4 }}
            data-testid="study-code-toggle"
            aria-expanded={isExpanded}
        >
            {label}
            <ToggleChevron isExpanded={isExpanded} />
        </Anchor>
    )
}

type StudyCodeViewerProps = {
    studyJobId: string
    files: CodeFile[]
    initialExpanded?: boolean
    toggleLabels?: StudyCodeToggleLabels
}

export function StudyCodeViewer({
    studyJobId,
    files,
    initialExpanded = true,
    toggleLabels = DEFAULT_STUDY_CODE_TOGGLE_LABELS,
}: StudyCodeViewerProps) {
    const { activeFile, selectFile, isExpanded, toggleExpanded } = useStudyCodeViewer(files, initialExpanded)
    const { visible, hidden } = splitVisibleFiles(files)
    const hasFiles = files.length > 0

    return (
        <Stack gap="lg" data-testid="study-code-viewer">
            <Stack gap="sm">
                <FileTabsRow
                    isVisible={isExpanded}
                    visible={visible}
                    activeFileName={activeFile?.name ?? null}
                    onSelect={selectFile}
                    hidden={hidden}
                    studyJobId={studyJobId}
                />
                <StudyCodeBody isVisible={isExpanded} activeFile={activeFile} studyJobId={studyJobId} />
            </Stack>
            <StudyCodeToggle
                isVisible={hasFiles}
                isExpanded={isExpanded}
                onClick={toggleExpanded}
                labels={toggleLabels}
            />
        </Stack>
    )
}
