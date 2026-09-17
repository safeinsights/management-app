import type { FC, RefObject } from 'react'
import { Group, Skeleton, Stack } from '@mantine/core'
import type { StudyCodeIDE } from '@/hooks/use-ide-files'
import { LaunchIdeControl } from './launch-ide-control'
import { LaunchProgress } from './launch-progress'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { StudyCodeReviewView } from './study-code-review-view'
import { UploadFilesButton } from './upload-files-button'

type OpenRef = RefObject<(() => void) | null>

/**
 * One definition of "the files have loaded and there is at least one of them", because the action
 * row and the body below it both key off it and must never disagree.
 */
export const isFilesReviewState = (ide: StudyCodeIDE) => !ide.isLoadingFiles && !ide.showEmptyState

const LaunchIdeAction: FC<{ isVisible: boolean; ide: StudyCodeIDE }> = ({ isVisible, ide }) => (
    <LaunchIdeControl
        isVisible={isVisible}
        isClaimed={ide.isIdeClaimed}
        canLaunch={ide.canEditInIde}
        ideOwnerName={ide.ideOwnerName}
        isLaunching={ide.isLaunching}
        onLaunch={ide.launchWorkspace}
    />
)

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
    /** Named in the Template badge's hover card. */
    dataPartnerName: string
    showLaunchIde: boolean
    openRef: OpenRef
}

export const StudyCodeFilesBody: FC<StudyCodeFilesBodyProps> = ({ ide, dataPartnerName, showLaunchIde, openRef }) => {
    if (ide.isLoadingFiles) return <Skeleton height={240} radius="md" />

    // The empty view draws its own launch progress and owns its own dropzone ref.
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
                editFileInIde={ide.editFileInIde}
                downloadFile={ide.downloadFile}
                dataPartnerName={dataPartnerName}
                templateFileNames={ide.templateFileNames}
                canEditInIde={ide.canEditInIde}
                ideOwnerName={ide.ideOwnerName}
                openRef={openRef}
            />
        </Stack>
    )
}

// The Submit code page moved to your-files-section.tsx; what stays here is what /resubmit still
// renders through StudyCodePanel.
