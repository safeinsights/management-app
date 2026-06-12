import { useRef, type ReactNode } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import type { FileWithPath } from '@mantine/dropzone'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { InfoTooltip } from '@/components/tooltip'
import { FileDropOverlay } from './file-drop-overlay'
import { FileReviewTable } from './file-review-table'
import { LaunchIdeButton } from './launch-ide-button'
import { UploadFilesButton } from './upload-files-button'

interface StudyCodeReviewViewProps {
    launchWorkspace: () => void
    isLaunching: boolean
    launchError: Error | null
    launchReason?: string | null
    launchLastLogAt?: string | null
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
    launchReason,
    launchLastLogAt,
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
                reason={launchReason}
                lastLogAt={launchLastLogAt}
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

            <Stack gap={4}>
                <Text fw={600}>Review files</Text>
                <Text size="sm" c="dimmed">
                    If you’re creating or uploading multiple files, please select your main file (i.e., the script that
                    runs first).
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
