import { useRef, type ReactNode } from 'react'
import { Divider, Group, Stack, Text } from '@mantine/core'
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
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    files: WorkspaceFileInfo[]
    mainFile: string
    setMainFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    viewFile: (fileName: string) => void
    jobCreatedAt: string | null
    showLaunchIde?: boolean
}

export function StudyCodeReviewView({
    launchWorkspace,
    isLaunching,
    launchError,
    uploadFiles,
    isUploading,
    files,
    mainFile,
    setMainFile,
    removeFile,
    viewFile,
    jobCreatedAt,
    showLaunchIde = true,
}: StudyCodeReviewViewProps) {
    const openRef = useRef<() => void>(null)

    let launchSection: ReactNode = null
    if (showLaunchIde) {
        const launchButton = (
            <LaunchIdeButton
                onClick={launchWorkspace}
                isLaunching={isLaunching}
                launchError={launchError}
                variant="outline"
            />
        )
        launchSection = (
            <InfoTooltip
                label="After creating or editing files in the IDE, please return here to submit your code to the data partners."
                withArrow
                multiline
                w={320}
            >
                {launchButton}
            </InfoTooltip>
        )
    }

    return (
        <Stack gap="lg">
            <Group justify="flex-end" wrap="nowrap">
                {launchSection}
                <UploadFilesButton openRef={openRef} disabled={isUploading} />
            </Group>

            <Divider />

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
                />
            </FileDropOverlay>
        </Stack>
    )
}
