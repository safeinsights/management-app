'use client'

import { useRef, type FC } from 'react'
import { Divider, Group, Paper, Skeleton, Stack, Title } from '@mantine/core'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { FileDropOverlay } from './file-drop-overlay'
import { LaunchProgress } from './launch-progress'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { isFilesReviewState, StudyCodeFileActions } from './study-code-files'
import { YourFilesTable } from './your-files-table'

const SECTION_TITLE = 'Code files'

/** `Spacing/lg` in the Figma frames; Mantine `lg` is 20px in this app's theme, the token is 24px. */
const SECTION_GAP = 24

type FilesBodyProps = {
    ide: StudyCodeIDE
    isEditable: boolean
    showLaunchIde: boolean
    openRef: React.RefObject<(() => void) | null>
}

const FilesBody: FC<FilesBodyProps> = ({ ide, isEditable, showLaunchIde, openRef }) => {
    if (ide.isLoadingFiles) return <Skeleton height={240} radius="md" />

    // Until the Data Partner's template is pre-loaded as the default main file (deferred: the
    // template badge is still TBC on the card), a study with no uploads has an empty table, so the
    // empty view still owns that state.
    if (ide.showEmptyState) {
        return (
            <StudyCodeEmptyView
                launchWorkspace={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                launchLastUpdatedAt={ide.launchLastUpdatedAt}
                launchBuildLog={ide.launchBuildLog}
                launchAgentLog={ide.launchAgentLog}
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                starterFiles={ide.starterFiles}
                showLaunchIde={showLaunchIde}
            />
        )
    }

    return (
        <Stack gap="md">
            <LaunchProgress
                isVisible={ide.isLaunching}
                buildLog={ide.launchBuildLog}
                agentLog={ide.launchAgentLog}
                lastUpdatedAt={ide.launchLastUpdatedAt}
            />
            {/* The overlay is what the header's Upload button actually opens, via openRef, as well
                as taking drops onto the table. Row 8 moves the entry point into "Already have
                code?", at which point this ref crosses fewer components. */}
            <FileDropOverlay
                onDrop={ide.uploadFiles}
                disabled={ide.isUploading}
                showHelperText={false}
                openRef={openRef}
            >
                <YourFilesTable
                    files={ide.fileDetails}
                    mainFile={ide.mainFile}
                    isEditable={isEditable}
                    onSelectMain={ide.setMainFile}
                    onView={ide.viewFile}
                    // The pencil opens the study's workspace, the same target as Launch IDE. Which
                    // researcher may do so is row 7's ownership work; today nobody has claimed it,
                    // and the card's pre-claim state is enabled for everyone.
                    onEdit={ide.launchWorkspace}
                    onDownload={ide.downloadFile}
                    onDelete={ide.removeFile}
                />
            </FileDropOverlay>
        </Stack>
    )
}

type YourFilesSectionProps = {
    ide: StudyCodeIDE
    /** False puts the table in view-only mode: the star and the row actions go disabled. */
    isEditable?: boolean
    showLaunchIde?: boolean
}

/**
 * The "Your files" card (OTTER-693 row 6). Deliberately standalone so the view-only code screens
 * and /resubmit can adopt it without inheriting the Submit code page's chrome — it takes the IDE
 * hook and an editability flag and nothing else.
 *
 * Not yet from the card: Last activity (the workspace listing carries no per-file provenance), the
 * pencil's IDE-ownership lock (row 7 shares that state), and the pre-loaded template main file with
 * its badge (TBC).
 */
export const YourFilesSection: FC<YourFilesSectionProps> = ({ ide, isEditable = true, showLaunchIde = true }) => {
    // Shared with the drop overlay inside the empty view, so the Upload button and the dropzone it
    // opens have to stay under one component.
    const openRef = useRef<() => void>(null)
    const isReviewState = isFilesReviewState(ide)

    return (
        <>
            <Paper p="xxl" data-testid="your-files-section">
                <Group justify="space-between" wrap="nowrap" align="center">
                    <Title order={3} fz="lg" c="charcoal.9">
                        {SECTION_TITLE}
                    </Title>
                    <StudyCodeFileActions
                        isVisible={isReviewState && isEditable}
                        ide={ide}
                        showLaunchIde={showLaunchIde}
                        openRef={openRef}
                    />
                </Group>
                <Divider my={SECTION_GAP} color="charcoal.1" data-testid="your-files-divider" />
                <FilesBody ide={ide} isEditable={isEditable} showLaunchIde={showLaunchIde} openRef={openRef} />
            </Paper>

            <FileOrImagePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />
        </>
    )
}
