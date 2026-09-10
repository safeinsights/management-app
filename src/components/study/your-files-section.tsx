'use client'

import { useRef, type FC } from 'react'
import { Divider, Group, Paper, Skeleton, Stack, Title } from '@mantine/core'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { AlreadyHaveCodeSection } from './already-have-code-section'
import { FileDropOverlay } from './file-drop-overlay'
import { IdeLaunchFailedModal } from './ide-launch-failed-modal'
import { IdeLaunchProgressModal } from './ide-launch-progress-modal'
import { ReplaceFileModal } from './replace-file-modal'
import { SubmitCodeError } from './submit-code-error'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { isFilesReviewState } from './study-code-files'
import { LaunchIdeControl } from './launch-ide-control'
import { UploadFilesButton } from './upload-files-button'
import { YourFilesTable } from './your-files-table'

const SECTION_TITLE = 'Code files'

/** `Spacing/lg` in the Figma frames; Mantine `lg` is 20px in this app's theme, the token is 24px. */
const SECTION_GAP = 24

type FilesBodyProps = {
    ide: StudyCodeIDE
    dataPartnerName: string
    isEditable: boolean
    showLaunchIde: boolean
    submitError: string | null
    openRef: React.RefObject<(() => void) | null>
}

const FilesBody: FC<FilesBodyProps> = ({ ide, dataPartnerName, isEditable, showLaunchIde, submitError, openRef }) => {
    if (ide.isLoadingFiles) return <Skeleton height={240} radius="md" />

    // Starter files only reach the workspace on the first IDE launch, so a study nobody has
    // launched or uploaded to has an empty table and the empty view still owns that state. The
    // design shows the template row before any launch — see the note on this component.
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
                    templateFileNames={ide.templateFileNames}
                    dataPartnerName={dataPartnerName}
                    isEditable={isEditable}
                    canEditInIde={ide.canEditInIde}
                    ideOwnerName={ide.ideOwnerName}
                    onSelectMain={ide.setMainFile}
                    onView={ide.viewFile}
                    // Records the edit against this file, then opens the study's workspace — the
                    // same target as Launch IDE, and what claims the IDE for whoever got there
                    // first.
                    onEdit={ide.editFileInIde}
                    onDownload={ide.downloadFile}
                    onDelete={ide.removeFile}
                />
            </FileDropOverlay>
            <SubmitCodeError message={submitError} />
            <AlreadyHaveCodeSection isVisible={isEditable} openRef={openRef} />
        </Stack>
    )
}

type YourFilesSectionProps = {
    ide: StudyCodeIDE
    dataPartnerName: string
    /** Set once a submit attempt was blocked; rendered under the table, per the design. */
    submitError?: string | null
    /** False puts the table in view-only mode: the star and the row actions go disabled. */
    isEditable?: boolean
    showLaunchIde?: boolean
}

/**
 * The Code files card (OTTER-693 row 6). Deliberately standalone so the view-only code screens and
 * /resubmit can adopt it without inheriting the Submit code page's chrome — it takes the IDE hook,
 * the Data Partner's name and an editability flag, and nothing else.
 *
 * One gap against the card remains: the Data Partner's template appears only once someone launches
 * the IDE, which is when starter files are copied in. The design shows it on first page load, so
 * pre-loading it earlier is still outstanding.
 */
export const YourFilesSection: FC<YourFilesSectionProps> = ({
    ide,
    dataPartnerName,
    submitError = null,
    isEditable = true,
    showLaunchIde = true,
}) => {
    // Shared with the drop overlay inside the empty view, so the Upload button and the dropzone it
    // opens have to stay under one component.
    const openRef = useRef<() => void>(null)
    const isReviewState = isFilesReviewState(ide)

    return (
        <>
            <Paper p="xxl" data-testid="your-files-section">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Title order={3} fz="lg" c="charcoal.9">
                        {SECTION_TITLE}
                    </Title>
                    <Group gap="sm" wrap="nowrap" align="flex-start">
                        <UploadFilesButton
                            isVisible={isReviewState && isEditable}
                            openRef={openRef}
                            disabled={ide.isUploading}
                        />
                        <LaunchIdeControl
                            // The card ties display to editability alone, because its design has no
                            // empty state — the template row is always there. Until that pre-load
                            // lands, the empty view still owns the launch affordance, so gating on
                            // review state is what keeps exactly one Launch IDE on screen.
                            isVisible={isEditable && showLaunchIde && isReviewState}
                            isClaimed={ide.isIdeClaimed}
                            canLaunch={ide.canEditInIde}
                            ideOwnerName={ide.ideOwnerName}
                            isLaunching={ide.isLaunching}
                            onLaunch={ide.launchWorkspace}
                        />
                    </Group>
                </Group>
                <Divider my={SECTION_GAP} color="charcoal.1" data-testid="your-files-divider" />
                <FilesBody
                    ide={ide}
                    dataPartnerName={dataPartnerName}
                    isEditable={isEditable}
                    showLaunchIde={showLaunchIde}
                    submitError={submitError}
                    openRef={openRef}
                />
            </Paper>

            <FileOrImagePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />

            <ReplaceFileModal file={ide.pendingDuplicate} onResolve={ide.resolveDuplicate} />

            <IdeLaunchProgressModal
                isOpen={ide.isLaunching}
                onAbandon={ide.abandonLaunch}
                dataPartnerName={dataPartnerName}
                buildLog={ide.launchBuildLog}
                agentLog={ide.launchAgentLog}
            />

            {/* Retry re-launches rather than just dismissing: clearing the error alone would leave
                the researcher looking at an unchanged card with no sign of what to do next. */}
            <IdeLaunchFailedModal
                isOpen={Boolean(ide.launchError)}
                onClose={ide.clearLaunchError}
                onRetry={ide.launchWorkspace}
            />
        </>
    )
}
