'use client'

import { fontWeight, semanticColor } from '@/theme/tokens'
import { ActionIcon, Alert, Group, Menu, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core'
import { CaretRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { useState } from 'react'
import { useQuery } from '@/common'
import { CodeViewer, ImageViewer } from '@/components/file-viewers'
import { decodeFileContents, imageMimeType } from '@/lib/file-content-helpers'
import { highlightLanguageForFile } from '@/lib/languages'
import { studyCodeURL } from '@/lib/paths'
import { fetchStudyJobCodeFileAction } from '@/server/actions/study-job.actions'
import type { CodeFile } from './study-code-files'
import {
    FULL_STUDY_CODE_TOGGLE_LABELS,
    StudyCodeToggle,
    type StudyCodeToggleLabels,
} from '@/app/[orgSlug]/study/[studyId]/view/study-code-collapse'

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
            // md, not sm: WCAG 2.5.8 wants a 24px target, and sm is 22px.
            size="md"
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
