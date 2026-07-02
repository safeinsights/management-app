import type { RefObject } from 'react'
import { Stack, Text } from '@mantine/core'
import type { FileWithPath } from '@mantine/dropzone'
import type { WorkspaceFileInfo } from '@/hooks/use-workspace-files'
import { FileDropOverlay } from './file-drop-overlay'
import { FileReviewTable } from './file-review-table'

interface StudyCodeReviewViewProps {
    uploadFiles: (files: FileWithPath[]) => void
    isUploading: boolean
    files: WorkspaceFileInfo[]
    mainFile: string
    setMainFile: (fileName: string) => void
    removeFile: (fileName: string) => void
    viewFile: (fileName: string) => void
    jobCreatedAt: string | null
    openRef: RefObject<(() => void) | null>
}

export function StudyCodeReviewView({
    uploadFiles,
    isUploading,
    files,
    mainFile,
    setMainFile,
    removeFile,
    viewFile,
    jobCreatedAt,
    openRef,
}: StudyCodeReviewViewProps) {
    return (
        <Stack gap="lg">
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
