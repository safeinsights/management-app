'use client'

import { fontWeight, semanticColor } from '@/theme/tokens'
import { Alert, Anchor, Box, Center, Scroller, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { CaretLeftIcon, CaretRightIcon, DownloadSimpleIcon } from '@phosphor-icons/react/dist/ssr'
import { useState, type MouseEvent } from 'react'
import { useQuery } from '@/common'
import { CodeViewer, ImageViewer } from '@/components/file-viewers'
import { downloadURL } from '@/lib/download-blob'
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

function CodeFilesHeading({ isVisible }: { isVisible: boolean }) {
    if (!isVisible) return null
    return (
        <Text fw={fontWeight.bold} fz="md">
            Code files
        </Text>
    )
}

function downloadCodeFile(event: MouseEvent, studyJobId: string, fileName: string) {
    event.stopPropagation()
    downloadURL(fileName, studyCodeURL(studyJobId, fileName))
}

// A tab is a button and cannot hold a link, so this is a mouse-only target. Keyboard and screen
// reader users download through ActiveFileDownloadLink.
function TabDownloadIcon({
    studyJobId,
    fileName,
    isActive,
}: {
    studyJobId: string
    fileName: string
    isActive: boolean
}) {
    return (
        <Center
            component="span"
            // WCAG 2.5.8 wants a 24px target around the 14px glyph.
            w={24}
            h={24}
            aria-hidden
            className="clickable"
            onClick={(event) => downloadCodeFile(event, studyJobId, fileName)}
            data-testid="study-code-tab-download"
        >
            <DownloadSimpleIcon
                size={14}
                weight="bold"
                color={isActive ? semanticColor('text.white') : semanticColor('icon.dark')}
            />
        </Center>
    )
}

function CodeFileTab({ file, isActive, studyJobId }: { file: CodeFile; isActive: boolean; studyJobId: string }) {
    return (
        <Tabs.Tab
            value={file.name}
            title={file.name}
            h={40}
            miw={192}
            ps="md"
            pe="sm"
            rightSection={<TabDownloadIcon studyJobId={studyJobId} fileName={file.name} isActive={isActive} />}
        >
            <Text
                span
                display="block"
                truncate
                maw={166}
                ta="left"
                size="sm"
                c={isActive ? semanticColor('text.white') : semanticColor('text.primary')}
                fw={isActive ? fontWeight.semibold : fontWeight.regular}
            >
                {file.name}
            </Text>
        </Tabs.Tab>
    )
}

function CodeFileTabsRow({
    files,
    activeFileName,
    studyJobId,
}: {
    files: CodeFile[]
    activeFileName: string
    studyJobId: string
}) {
    const tabs = files.map((file) => (
        <CodeFileTab key={file.name} file={file} isActive={file.name === activeFileName} studyJobId={studyJobId} />
    ))
    // max-content stops Mantine's tab list from wrapping, so a long row overflows for the Scroller.
    return (
        <Scroller
            draggable={false}
            startControlIcon={<CaretLeftIcon size={16} weight="bold" />}
            endControlIcon={<CaretRightIcon size={16} weight="bold" />}
            startControlProps={{ 'aria-label': 'Scroll files left' }}
            endControlProps={{ 'aria-label': 'Scroll files right' }}
        >
            <Tabs.List w="max-content" aria-label="Code files">
                {tabs}
            </Tabs.List>
        </Scroller>
    )
}

function ActiveFileDownloadLink({ studyJobId, fileName }: { studyJobId: string; fileName: string }) {
    return (
        <Box className="visually-hidden-focusable">
            <Anchor href={studyCodeURL(studyJobId, fileName)} download={fileName} size="sm">
                Download {fileName}
            </Anchor>
        </Box>
    )
}

function useStudyCodeFileContents(studyJobId: string, fileName: string) {
    return useQuery({
        queryKey: ['study-job-code-file', studyJobId, fileName],
        queryFn: () => fetchStudyJobCodeFileAction({ studyJobId, fileName }),
        staleTime: Infinity,
    })
}

function StudyCodeBody({ file, studyJobId }: { file: CodeFile; studyJobId: string }) {
    const { data, isLoading, isError } = useStudyCodeFileContents(studyJobId, file.name)

    if (isLoading) {
        return <Skeleton height={240} radius="sm" data-testid="study-code-body-loading" />
    }
    if (isError || !data) {
        return (
            <Alert color="red" data-testid="study-code-body-error">
                Unable to load {file.name}.
            </Alert>
        )
    }
    const mime = imageMimeType(file.name)
    if (mime) {
        return (
            <div data-testid="study-code-body">
                <ImageViewer name={file.name} contents={data.contents} mime={mime} />
            </div>
        )
    }

    const code = decodeFileContents(data.contents)
    return (
        <div data-testid="study-code-body">
            <CodeViewer code={code} language={highlightLanguageForFile(file.name)} withBorder />
        </div>
    )
}

function CodeFilePanel({ file, studyJobId }: { file: CodeFile; studyJobId: string }) {
    return (
        <Tabs.Panel value={file.name} pt={0}>
            <StudyCodeBody file={file} studyJobId={studyJobId} />
        </Tabs.Panel>
    )
}

function StudyCodeFiles({
    isVisible,
    files,
    activeFile,
    onSelect,
    studyJobId,
}: {
    isVisible: boolean
    files: CodeFile[]
    activeFile: CodeFile | null
    onSelect: (name: string | null) => void
    studyJobId: string
}) {
    if (!isVisible) return null
    if (!activeFile) {
        return (
            <Text size="sm" c="dimmed" data-testid="study-code-empty">
                No code files have been submitted yet.
            </Text>
        )
    }
    const panels = files.map((file) => <CodeFilePanel key={file.name} file={file} studyJobId={studyJobId} />)

    return (
        <Tabs
            value={activeFile.name}
            onChange={onSelect}
            variant="pills"
            radius="xs"
            color={semanticColor('surface.selected')}
            keepMounted={false}
            activateTabWithKeyboard={false}
        >
            <Stack gap="sm">
                <CodeFileTabsRow files={files} activeFileName={activeFile.name} studyJobId={studyJobId} />
                <ActiveFileDownloadLink studyJobId={studyJobId} fileName={activeFile.name} />
                {panels}
            </Stack>
        </Tabs>
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
    const hasFiles = files.length > 0

    const expanded = onCollapse ? true : isExpanded
    const handleToggle = onCollapse ?? toggleExpanded
    const toggleTestId = onCollapse ? 'study-code-toggle-collapse' : 'study-code-toggle'
    const toggleVisible = onCollapse ? true : hasFiles

    return (
        <Stack gap="lg" data-testid="study-code-viewer">
            <Stack gap="sm">
                <CodeFilesHeading isVisible={expanded} />
                <StudyCodeFiles
                    isVisible={expanded}
                    files={files}
                    activeFile={activeFile}
                    onSelect={selectFile}
                    studyJobId={studyJobId}
                />
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
