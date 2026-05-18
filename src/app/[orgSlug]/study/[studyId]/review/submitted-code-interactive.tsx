'use client'

import { Alert, Group, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core'
import { useState } from 'react'
import { useQuery } from '@/common'
import { CodeViewer } from '@/components/code-viewer'
import { highlightLanguageForFile } from '@/lib/languages'
import { fetchStudyJobCodeFileAction } from '@/server/actions/study-job.actions'
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
        return { visible: files, hiddenCount: 0 }
    }
    // When overflowing, the last visible slot becomes the "+N more files" indicator,
    // so we keep three real tabs and roll the remainder into the overflow count.
    const visibleSlots = MAX_VISIBLE_TABS_BEFORE_OVERFLOW - 1
    return { visible: files.slice(0, visibleSlots), hiddenCount: files.length - visibleSlots }
}

function useAiSummaryToggle() {
    const [isExpanded, setIsExpanded] = useState(false)
    return { isExpanded, toggle: () => setIsExpanded((v) => !v) }
}

function AiSummaryBody({ isVisible, summary }: { isVisible: boolean; summary: string }) {
    if (!isVisible) return null
    return (
        <Text size="sm" data-testid="ai-summary-body" style={{ whiteSpace: 'pre-wrap' }}>
            {summary}
        </Text>
    )
}

type AiSummaryProps = { summary: string | null }

export function AiSummaryCollapsible({ summary }: AiSummaryProps) {
    const { isExpanded, toggle } = useAiSummaryToggle()
    const toggleLabel = isExpanded ? 'Hide full AI summary' : 'View full AI summary'
    const hasSummary = !!summary

    const placeholder = (
        <Text size="sm" c="dimmed" data-testid="ai-summary-empty">
            No AI summary available yet.
        </Text>
    )
    const content = (
        <>
            <AiSummaryBody isVisible={isExpanded} summary={summary ?? ''} />
            <UnstyledButton onClick={toggle} data-testid="ai-summary-toggle">
                <Text size="sm" c="blue.6" td="underline">
                    {toggleLabel}
                </Text>
            </UnstyledButton>
        </>
    )

    return (
        <Stack gap="xs" data-testid="ai-summary">
            <Text fw={700}>AI Summary: Analysis of all files</Text>
            <Text fw={600} size="sm">
                Overview
            </Text>
            {hasSummary ? content : placeholder}
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
                borderBottom: isActive ? '2px solid var(--mantine-color-blue-6)' : '2px solid transparent',
                fontWeight: isActive ? 700 : 400,
                whiteSpace: 'nowrap',
            }}
        >
            <Text size="sm" component="span">
                {display}
            </Text>
        </UnstyledButton>
    )
}

function FileTabsRow({
    isVisible,
    visible,
    activeFileName,
    onSelect,
    hiddenCount,
}: {
    isVisible: boolean
    visible: CodeFile[]
    activeFileName: string | null
    onSelect: (name: string) => void
    hiddenCount: number
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
    const overflow =
        hiddenCount > 0 ? (
            <Text size="sm" c="charcoal.7" data-testid="study-code-files-overflow" style={{ whiteSpace: 'nowrap' }}>
                +{hiddenCount} more files
            </Text>
        ) : null

    return (
        <Group gap="sm" wrap="nowrap" style={{ overflow: 'hidden' }} data-testid="study-code-file-tabs">
            {tabs}
            {overflow}
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

export const DEFAULT_STUDY_CODE_TOGGLE_LABELS: StudyCodeToggleLabels = {
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
        <UnstyledButton onClick={onClick} data-testid="study-code-toggle">
            <Text size="sm" c="blue.6" td="underline">
                {label}
            </Text>
        </UnstyledButton>
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
    const { visible, hiddenCount } = splitVisibleFiles(files)
    const hasFiles = files.length > 0

    return (
        <Stack gap="sm" data-testid="study-code-viewer">
            <FileTabsRow
                isVisible={isExpanded}
                visible={visible}
                activeFileName={activeFile?.name ?? null}
                onSelect={selectFile}
                hiddenCount={hiddenCount}
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
