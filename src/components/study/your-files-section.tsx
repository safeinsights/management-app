'use client'

import { useRef, type FC, type ReactNode } from 'react'
import { Divider, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { AlreadyHaveCodeSection } from './already-have-code-section'
import { FileDropOverlay } from './file-drop-overlay'
import { IdeLaunchFailedModal } from './ide-launch-failed-modal'
import { IdeLaunchProgressModal } from './ide-launch-progress-modal'
import { ReplaceFileModal } from './replace-file-modal'
import { SubmitCodeError } from './submit-code-error'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { showsLaunchIdeControl } from './study-code-files'
import { IdeLaunchAction } from './launch-ide-control'
import { YourFilesTable } from './your-files-table'
import { semanticColor } from '@/theme/tokens'

const SECTION_TITLE = 'Code files'

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

    if (ide.showEmptyState) {
        return (
            <StudyCodeEmptyView
                launchWorkspace={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchLastUpdatedAt={ide.launchLastUpdatedAt}
                launchBuildLog={ide.launchBuildLog}
                launchAgentLog={ide.launchAgentLog}
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                starterFiles={ide.starterFiles}
                showLaunchIde={showLaunchIde}
                isIdeClaimed={ide.isIdeClaimed}
                canEditInIde={ide.canEditInIde}
                ideOwnerName={ide.ideOwnerName}
            />
        )
    }

    return (
        <Stack gap="md">
            {/* Wraps the table so a drop and the "Already have code?" link take one path. */}
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

const SectionDescription: FC<{ text?: string }> = ({ text }) => {
    if (!text) return null

    return (
        <Text size="sm" c={semanticColor('text.primary')}>
            {text}
        </Text>
    )
}

const SectionHeading: FC<{ description?: string }> = ({ description }) => (
    <Stack gap="xxs">
        <Title order={3} fz="lg" c={semanticColor('text.primary')}>
            {SECTION_TITLE}
        </Title>
        <SectionDescription text={description} />
    </Stack>
)

type SectionLayoutProps = {
    isNested: boolean
    description?: string
    launchControl: ReactNode
    body: ReactNode
}

/**
 * Nested inside another panel (/resubmit puts it under the step header) the card chrome and the
 * Launch IDE button belong to that panel, so this renders the heading and the files alone.
 */
const SectionLayout: FC<SectionLayoutProps> = ({ isNested, description, launchControl, body }) => {
    if (isNested) {
        return (
            <Stack gap="lg" data-testid="your-files-section">
                <SectionHeading description={description} />
                {body}
            </Stack>
        )
    }

    return (
        <Paper p="xxl" data-testid="your-files-section">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
                <SectionHeading description={description} />
                {launchControl}
            </Group>
            <Divider my="lg" color={semanticColor('border.default')} data-testid="your-files-divider" />
            {body}
        </Paper>
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
    /** Sits under the section title; only /resubmit asks for one (OTTER-778). */
    description?: string
    /** True when a caller renders this inside its own panel, which then owns the card and Launch IDE. */
    isNested?: boolean
}

/**
 * The Code files card. Standalone so the view-only code screens and /resubmit can adopt it without
 * inheriting the Submit code page's chrome.
 *
 * OTTER-693 gap: starter files only reach the workspace on the first IDE launch, so the template
 * row the design shows on first page load is missing until someone launches. Until that pre-load
 * lands, the empty view keeps its own launch affordance and this card gates on review state.
 */
export const YourFilesSection: FC<YourFilesSectionProps> = ({
    ide,
    dataPartnerName,
    submitError = null,
    isEditable = true,
    showLaunchIde = true,
    description,
    isNested = false,
}) => {
    // The dropzone and everything that opens it have to sit under one component.
    const openRef = useRef<() => void>(null)

    // Launch IDE alone: per the design the header has no upload control, and uploading is reached
    // through "Already have code?" or a drop onto the table. Nested, the enclosing panel owns the
    // header row and renders its own, so building one here would risk a second on screen.
    const launchControl = isNested ? null : (
        <IdeLaunchAction ide={ide} isVisible={showsLaunchIdeControl({ ide, isEditable, showLaunchIde })} />
    )

    const body = (
        <FilesBody
            ide={ide}
            dataPartnerName={dataPartnerName}
            isEditable={isEditable}
            showLaunchIde={showLaunchIde}
            submitError={submitError}
            openRef={openRef}
        />
    )

    return (
        <>
            <SectionLayout isNested={isNested} description={description} launchControl={launchControl} body={body} />

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
                supportRef={ide.launchErrorEventId}
            />
        </>
    )
}
