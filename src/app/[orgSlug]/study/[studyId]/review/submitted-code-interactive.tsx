'use client'

import { Alert, Anchor, Group, Loader, Menu, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { useEffect, useState } from 'react'
import { useQuery } from '@/common'
import { CodeViewer } from '@/components/file-viewers'
import { highlightLanguageForFile } from '@/lib/languages'
import { fetchStudyJobCodeFileAction, getStudyReviewAction } from '@/server/actions/study-job.actions'
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

function AiSummaryBody({ isExpanded, summary }: { isExpanded: boolean; summary: string }) {
    return (
        <Text
            size="sm"
            data-testid="ai-summary-body"
            lineClamp={isExpanded ? undefined : AI_SUMMARY_COLLAPSED_LINE_CLAMP}
            style={{ whiteSpace: 'pre-wrap' }}
        >
            {summary}
        </Text>
    )
}

function ToggleChevron({ isExpanded }: { isExpanded: boolean }) {
    return (
        <CaretRight
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

// A failed generation never writes a studyReview row — the deferred background
// task swallows the error — so polling would otherwise spin forever. After this
// long with no row, surface the error state instead.
const AI_SUMMARY_TIMEOUT_MS = 30_000

// Returns true once `ms` has elapsed since mount. Used to time out the AI
// summary spinner so a never-arriving review surfaces as an error.
function useElapsedTimeout(ms: number): boolean {
    const [elapsed, setElapsed] = useState(false)
    useEffect(() => {
        const id = setTimeout(() => setElapsed(true), ms)
        return () => clearTimeout(id)
    }, [ms])
    return elapsed
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

function AiSummaryError() {
    return (
        <Alert color="red" data-testid="ai-summary-error">
            The AI summary failed to generate. Please reload the page.
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
            <AiSummaryBody isExpanded={isExpanded} summary={summary} />
            <AiSummaryToggle isExpanded={isExpanded} onToggle={onToggle} />
        </>
    )
}

type AiSummaryProps = {
    studyJobId: string
    initialReview: StudyReviewWithMeta | null
    // Overridable so tests can exercise the timeout without faking timers.
    timeoutMs?: number
}

export function AiSummaryCollapsible({ studyJobId, initialReview, timeoutMs = AI_SUMMARY_TIMEOUT_MS }: AiSummaryProps) {
    const { isExpanded, toggle } = useAiSummaryToggle()
    const { data: review, error } = useStudyReviewPoll(studyJobId, initialReview)
    const timedOut = useElapsedTimeout(timeoutMs)
    const summary = review?.report.codeExplanation ?? null

    // A landed row is terminal — show the summary if present, otherwise the
    // empty state (the no-API-key / disabled-review placeholder path). While
    // still pending we show the spinner, escalating to an error when the poll
    // rejects or 30s pass with no row.
    const renderBody = () => {
        if (error != null) return <AiSummaryError />
        if (review != null) {
            if (!summary) return <AiSummaryEmpty />
            return <AiSummaryContent summary={summary} isExpanded={isExpanded} onToggle={toggle} />
        }
        if (timedOut) return <AiSummaryError />
        return <AiSummaryPending />
    }

    return (
        <Stack gap="xs" data-testid="ai-summary">
            <Text fw={700}>AI Summary: Analysis of all files</Text>
            <Text fw={600} size="sm">
                Overview
            </Text>
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

function FileTab({ file, isActive, onClick }: { file: CodeFile; isActive: boolean; onClick: () => void }) {
    const display = truncateFileName(file.name)
    return (
        <UnstyledButton
            onClick={onClick}
            data-testid="study-code-file-tab"
            data-active={isActive ? 'true' : 'false'}
            title={file.name}
            px="md"
            py="xs"
            style={{
                backgroundColor: isActive ? 'var(--mantine-color-blue-6)' : 'transparent',
                borderRadius: 0,
                whiteSpace: 'nowrap',
            }}
        >
            <Text size="sm" component="span" c={isActive ? 'white' : 'charcoal.7'} fw={isActive ? 700 : 400}>
                {display}
            </Text>
        </UnstyledButton>
    )
}

function OverflowFilesMenu({
    hidden,
    activeFileName,
    onSelect,
}: {
    hidden: CodeFile[]
    activeFileName: string | null
    onSelect: (name: string) => void
}) {
    if (hidden.length === 0) return null
    const items = hidden.map((file) => (
        <Menu.Item
            key={file.name}
            onClick={() => onSelect(file.name)}
            data-testid="study-code-files-overflow-item"
            data-selected={file.name === activeFileName ? 'true' : 'false'}
            title={file.name}
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
                        <CaretRight size={12} weight="bold" />
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
}: {
    isVisible: boolean
    visible: CodeFile[]
    activeFileName: string | null
    onSelect: (name: string) => void
    hidden: CodeFile[]
}) {
    if (!isVisible) return null
    const tabs = visible.map((file) => (
        <FileTab
            key={file.name}
            file={file}
            isActive={file.name === activeFileName}
            onClick={() => onSelect(file.name)}
        />
    ))

    return (
        <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }} data-testid="study-code-file-tabs">
            {tabs}
            <OverflowFilesMenu hidden={hidden} activeFileName={activeFileName} onSelect={onSelect} />
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
            <CodeViewer code={data.contents} language={highlightLanguageForFile(activeFile.name)} />
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
        <Stack gap="sm" data-testid="study-code-viewer">
            <FileTabsRow
                isVisible={isExpanded}
                visible={visible}
                activeFileName={activeFile?.name ?? null}
                onSelect={selectFile}
                hidden={hidden}
            />
            <StudyCodeBody isVisible={isExpanded} activeFile={activeFile} studyJobId={studyJobId} />
            <StudyCodeToggle
                isVisible={hasFiles}
                isExpanded={isExpanded}
                onClick={toggleExpanded}
                labels={toggleLabels}
            />
        </Stack>
    )
}
