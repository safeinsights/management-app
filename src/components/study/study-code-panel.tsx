import type { ReactNode } from 'react'
import { Center, Group, Loader, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { highlightLanguageForFile } from '@/lib/languages'
import { CodeViewer } from '@/components/code-viewer'
import { AppModal } from '@/components/modal'
import { DownloadBlobLink } from '@/components/download-blob-link'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { StudyCodeReviewView } from './study-code-review-view'

export function FilePreviewModal({
    file,
    onClose,
}: {
    file: { name: string; contents: string | null } | null
    onClose: () => void
}) {
    if (!file) return null
    const isLoading = file.contents === null
    const title = (
        <Group gap="md" align="baseline">
            <span>{file.name}</span>
            {!isLoading && (
                <DownloadBlobLink filename={file.name} fileContent={file.contents ?? ''} size="sm" fw={400} />
            )}
        </Group>
    )
    return (
        <AppModal isOpen onClose={onClose} title={title} size="xl" styles={{ body: { padding: 0 } }}>
            {isLoading ? (
                <Center h={500} data-testid="file-preview-loading">
                    <Loader />
                </Center>
            ) : (
                <CodeViewer code={file.contents ?? ''} language={highlightLanguageForFile(file.name)} />
            )}
        </AppModal>
    )
}

export type StudyCodeIDE = ReturnType<typeof useIDEFiles>

interface StudyCodePanelProps {
    ide: StudyCodeIDE
    stepLabel?: string
    studyTitle: string
    footer: ReactNode
}

export const StudyCodePanel = ({ ide, stepLabel, studyTitle, footer }: StudyCodePanelProps) => {
    let body: ReactNode
    if (ide.isLoadingFiles) {
        body = <Skeleton height={240} radius="md" />
    } else if (ide.showEmptyState) {
        body = (
            <StudyCodeEmptyView
                launchWorkspace={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                starterFiles={ide.starterFiles}
            />
        )
    } else {
        body = (
            <StudyCodeReviewView
                launchWorkspace={ide.launchWorkspace}
                isLaunching={ide.isLaunching}
                launchError={ide.launchError}
                uploadFiles={ide.uploadFiles}
                isUploading={ide.isUploading}
                files={ide.fileDetails}
                mainFile={ide.mainFile}
                setMainFile={ide.setMainFile}
                removeFile={ide.removeFile}
                viewFile={ide.viewFile}
                jobCreatedAt={ide.jobCreatedAt}
            />
        )
    }

    return (
        <>
            <Paper p="xl">
                <Stack gap="sm">
                    {stepLabel && (
                        <Text fz="sm" fw={700} c="gray.7">
                            {stepLabel}
                        </Text>
                    )}
                    <Title order={4}>Study code</Title>
                    <Text size="sm" c="dimmed">
                        Title: {studyTitle}
                    </Text>
                </Stack>
                {body}
            </Paper>

            {footer}

            <FilePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />
        </>
    )
}
