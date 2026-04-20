import { useRef } from 'react'
import { Group, Stack, Text } from '@mantine/core'
import type { FileWithPath } from '@mantine/dropzone'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
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
}: StudyCodeReviewViewProps) {
    const openRef = useRef<() => void>(null)

    return (
        <Stack gap="md">
            <Group justify="flex-end" wrap="nowrap">
                <LaunchIdeButton
                    onClick={launchWorkspace}
                    isLaunching={isLaunching}
                    launchError={launchError}
                    variant="outline"
                />
                <UploadFilesButton openRef={openRef} disabled={isUploading} />
            </Group>

            <Stack gap={4}>
                <Text fw={600}>Review files</Text>
                <Text size="sm" c="dimmed">
                    If you&apos;re creating or uploading multiple files, please select your main file (i.e., the script
                    that runs first).
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
