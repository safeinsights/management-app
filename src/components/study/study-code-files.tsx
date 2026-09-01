import type { FC, RefObject } from 'react'
import { useRef } from 'react'
import { Group, Skeleton, Stack } from '@mantine/core'
import { FileOrImagePreviewModal } from '@/components/modals/file-or-image-preview-modal'
import { InfoTooltip } from '@/components/tooltip'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { LaunchIdeButton } from './launch-ide-button'
import { LaunchProgress } from './launch-progress'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { StudyCodeReviewView } from './study-code-review-view'
import { UploadFilesButton } from './upload-files-button'

const IDE_RETURN_HINT =
    'After creating or editing files in the IDE, please return here to submit your code to the Data Partner.'

type OpenRef = RefObject<(() => void) | null>

/**
 * One definition of "the files have loaded and there is at least one of them", because the action
 * row and the body below it both key off it and must never disagree.
 */
export const isFilesReviewState = (ide: StudyCodeIDE) => !ide.isLoadingFiles && !ide.showEmptyState

const LaunchIdeAction: FC<{ isVisible: boolean; ide: StudyCodeIDE }> = ({ isVisible, ide }) => {
    if (!isVisible) return null

    return (
        <InfoTooltip label={IDE_RETURN_HINT} withArrow multiline w={320}>
            <LaunchIdeButton
                onClick={(event) => ide.launchWorkspace({ sameWindow: event.shiftKey })}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                variant="outline"
            />
        </InfoTooltip>
    )
}

type StudyCodeFileActionsProps = {
    isVisible: boolean
    ide: StudyCodeIDE
    showLaunchIde: boolean
    openRef: OpenRef
}

/** Bare button pair, no alignment of its own, so a caller can drop it into its own header row. */
export const StudyCodeFileActions: FC<StudyCodeFileActionsProps> = ({ isVisible, ide, showLaunchIde, openRef }) => {
    if (!isVisible) return null

    return (
        <Group wrap="nowrap">
            <LaunchIdeAction isVisible={showLaunchIde} ide={ide} />
            <UploadFilesButton openRef={openRef} disabled={ide.isUploading} />
        </Group>
    )
}

type StudyCodeFilesBodyProps = {
    ide: StudyCodeIDE
    showLaunchIde: boolean
    openRef: OpenRef
}

export const StudyCodeFilesBody: FC<StudyCodeFilesBodyProps> = ({ ide, showLaunchIde, openRef }) => {
    if (ide.isLoadingFiles) return <Skeleton height={240} radius="md" />

    // The empty view draws its own launch progress and owns its own dropzone ref.
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
            <StudyCodeReviewView
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                files={ide.fileDetails}
                mainFile={ide.mainFile}
                setMainFile={ide.setMainFile}
                removeFile={ide.removeFile}
                viewFile={ide.viewFile}
                jobCreatedAt={ide.jobCreatedAt}
                openRef={openRef}
            />
        </Stack>
    )
}

type FilesActionRowProps = StudyCodeFileActionsProps

/**
 * Wrapping the row rather than the buttons keeps an empty flex row out of the loading and empty
 * states. OTTER-693 rows 6-7 replace this with the "Your files" heading row, where the buttons sit
 * opposite a title and the gate goes away.
 */
const FilesActionRow: FC<FilesActionRowProps> = ({ isVisible, ...actions }) => {
    if (!isVisible) return null

    return (
        <Group justify="flex-end" wrap="nowrap">
            <StudyCodeFileActions isVisible {...actions} />
        </Group>
    )
}

/**
 * The Submit code page's files block. Sits inside the STEP 3 section header's card for now;
 * OTTER-693 row 6 lifts it into its own reusable "Your files" card, which is also where the
 * /resubmit screen will eventually converge.
 */
export const StudyCodeFilesSection: FC<{ ide: StudyCodeIDE; showLaunchIde?: boolean }> = ({
    ide,
    showLaunchIde = true,
}) => {
    // Shared with the drop overlay inside the review view, so the Upload button and the dropzone
    // it opens have to stay under one component.
    const openRef = useRef<() => void>(null)
    const isReviewState = isFilesReviewState(ide)

    return (
        <Stack gap="lg">
            <FilesActionRow isVisible={isReviewState} ide={ide} showLaunchIde={showLaunchIde} openRef={openRef} />
            <StudyCodeFilesBody ide={ide} showLaunchIde={showLaunchIde} openRef={openRef} />
            <FileOrImagePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />
        </Stack>
    )
}
