import { useRef, type ReactNode } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import type { FileWithPath } from '@mantine/dropzone'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import type { WorkspaceLaunchStatus } from '@/server/coder/types'
import { InfoTooltip } from '@/components/tooltip'
import { FileDropOverlay } from './file-drop-overlay'
import { FileReviewTable } from './file-review-table'
import { LaunchIdeButton } from './launch-ide-button'
import { LaunchProgress } from './launch-progress'
import { UploadFilesButton } from './upload-files-button'

interface StudyCodeReviewViewProps {
    launchWorkspace: () => void
    isLaunching: boolean
    launchError: Error | null
    launchStatus?: WorkspaceLaunchStatus | null
    launchLastUpdatedAt?: Date | null
    launchBuildLog?: string
    launchAgentLog?: string
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    files: WorkspaceFileInfo[]
    mainFile: string
    setMainFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    viewFile: (fileName: string) => void
    jobCreatedAt: string | null
    mainFileColumnHeader?: ReactNode
    showLaunchIde?: boolean
    ideButtonTooltip?: string
}

export function StudyCodeReviewView({
    launchWorkspace,
    isLaunching,
    launchError,
    launchStatus,
    launchLastUpdatedAt,
    launchBuildLog = '',
    launchAgentLog = '',
    uploadFiles,
    isUploading,
    files,
    mainFile,
    setMainFile,
    removeFile,
    viewFile,
    jobCreatedAt,
    mainFileColumnHeader,
    showLaunchIde = true,
    ideButtonTooltip,
}: StudyCodeReviewViewProps) {
    const openRef = useRef<() => void>(null)

    let launchSection: ReactNode = null
    if (showLaunchIde) {
        const launchButton = (
            <LaunchIdeButton
                onClick={launchWorkspace}
                isLaunching={isLaunching}
                launchError={launchError}
                status={launchStatus}
                variant="outline"
            />
        )
        launchSection = ideButtonTooltip ? (
            <InfoTooltip label={ideButtonTooltip} withArrow multiline w={320}>
                {launchButton}
            </InfoTooltip>
        ) : (
            launchButton
        )
    }

    return (
        <Stack gap="md">
            <Group justify="flex-end" wrap="nowrap">
                {launchSection}
                <UploadFilesButton openRef={openRef} disabled={isUploading} />
            </Group>

            <LaunchProgress
                isVisible={isLaunching}
                buildLog={launchBuildLog}
                agentLog={launchAgentLog}
                lastUpdatedAt={launchLastUpdatedAt}
            />

            <Stack gap={4}>
                <Text fw={600}>Review files</Text>
                <Text size="sm" c="dimmed">
                    Review and manage submitted code files. You can update files, delete them, or upload new ones.
                </Text>
            </Stack>

            <FileDropOverlay onDrop={uploadFiles} disabled={isUploading} showHelperText={false} openRef={openRef}>
                <FileReviewTable
                    files={files}
                    mainFile={mainFile}
                    onMainFileChange={setMainFile}
                    onRemoveFile={removeFile}
                    onViewFile={viewFile}
                    jobCreatedAt={jobCreatedAt}
                    mainFileColumnHeader={mainFileColumnHeader}
                />
            </FileDropOverlay>
        </Stack>
    )
}
