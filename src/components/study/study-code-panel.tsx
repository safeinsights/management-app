import { useRef, type ReactNode } from 'react'
import { Divider, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { FilePreviewModal } from '@/components/modals/file-preview-modal'
import { InfoTooltip } from '@/components/tooltip'
import { LaunchIdeButton } from './launch-ide-button'
import { StudyCodeEmptyView } from './study-code-empty-view'
import { StudyCodeReviewView } from './study-code-review-view'
import { UploadFilesButton } from './upload-files-button'

export type StudyCodeIDE = ReturnType<typeof useIDEFiles>

interface StudyCodePanelProps {
    ide: StudyCodeIDE
    stepLabel?: string
    studyTitle: string | null
    footer: ReactNode
    showLaunchIde?: boolean
}

export const StudyCodePanel = ({ ide, stepLabel, studyTitle, footer, showLaunchIde = true }: StudyCodePanelProps) => {
    const openRef = useRef<() => void>(null)
    const isReviewState = !ide.isLoadingFiles && !ide.showEmptyState

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
                showLaunchIde={showLaunchIde}
            />
        )
    } else {
        body = (
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
        )
    }

    const reviewButtons = isReviewState ? (
        <Group wrap="nowrap">
            {showLaunchIde && (
                <InfoTooltip
                    label="After creating or editing files in the IDE, please return here to submit your code to the data partners."
                    withArrow
                    multiline
                    w={320}
                >
                    <LaunchIdeButton
                        onClick={ide.launchWorkspace}
                        isLaunching={ide.isLaunching}
                        launchError={ide.launchError}
                        variant="outline"
                    />
                </InfoTooltip>
            )}
            <UploadFilesButton openRef={openRef} disabled={ide.isUploading} />
        </Group>
    ) : null

    return (
        <>
            <Paper p="xl">
                <Stack gap="xs">
                    {stepLabel && (
                        <Text fz="sm" fw={700} c="gray.7">
                            {stepLabel}
                        </Text>
                    )}
                    <Title order={4}>Study code</Title>
                    <Group justify="space-between" wrap="nowrap" align="baseline">
                        {/* 65ch ≈ 75 rendered chars in Open Sans */}
                        <Text size="sm" c="dimmed" maw="65ch" style={{ overflowWrap: 'break-word' }}>
                            Title: {studyTitle ?? 'Untitled draft'}
                        </Text>
                        {reviewButtons}
                    </Group>
                </Stack>
                <Divider my="lg" />
                {body}
            </Paper>

            {footer}

            <FilePreviewModal file={ide.viewingFile} onClose={ide.closeFileViewer} />
        </>
    )
}
