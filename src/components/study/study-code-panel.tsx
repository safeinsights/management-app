import type { ReactNode } from 'react'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { Alert, Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, LightbulbIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FileChip } from '@/components/file-chip'
import { CompactStatusButton } from './compact-status-button'
import { FileReviewTable } from './file-review-table'
import { FileDropOverlay } from './file-drop-overlay'

const pluralize = (count: number, word: string) => (count === 1 ? word : `${word}s`)

export type StudyCodeIDE = ReturnType<typeof useIDEFiles>

interface StudyCodePanelProps {
    ide: StudyCodeIDE
    stepLabel?: string
    footer: ReactNode
}

export const StudyCodePanel = ({ ide, stepLabel, footer }: StudyCodePanelProps) => {
    const { messageWithEllipsis } = useLoadingMessages(ide.isLaunching)

    let launchButton = (
        <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={ide.launchWorkspace}>
            Edit files in IDE
        </Button>
    )
    if (ide.launchError) {
        launchButton = (
            <CompactStatusButton
                icon={<WarningCircleIcon size={14} weight="fill" />}
                primaryText="Launch failed"
                secondaryText="Please try again later"
                color="red"
                onClick={ide.launchWorkspace}
            />
        )
    } else if (ide.isLaunching) {
        launchButton = <CompactStatusButton primaryText="Launching IDE" secondaryText={messageWithEllipsis} loading />
    }

    const starterCodeChips = ide.starterFiles.length > 0 && (
        <Group gap="sm">
            <Text size="sm" c="dimmed">
                If uploading, you may wish to base your code off our{' '}
                {pluralize(ide.starterFiles.length, 'starter code file')}:
            </Text>
            {ide.starterFiles.map((file) => (
                <FileChip key={file.name} href={file.url} filename={file.name} />
            ))}
        </Group>
    )

    let body = (
        <FileDropOverlay onDrop={ide.uploadFiles} disabled={ide.isUploading}>
            <FileReviewTable
                files={ide.files}
                mainFile={ide.mainFile}
                onMainFileChange={ide.setMainFile}
                onRemoveFile={ide.removeFile}
                lastModified={ide.lastModified}
            />
        </FileDropOverlay>
    )
    if (ide.showEmptyState) {
        body = (
            <FileDropOverlay onDrop={ide.uploadFiles} disabled={ide.isUploading}>
                <Box bg="gray.1" py={60} style={{ borderRadius: 8 }}>
                    <Stack align="center" gap="md">
                        <Text c="dimmed">{ide.isLoadingFiles ? 'Loading files...' : 'Drop files here to upload'}</Text>
                    </Stack>
                </Box>
            </FileDropOverlay>
        )
    }

    return (
        <>
            <Paper p="xl">
                {stepLabel && (
                    <Text fz="sm" fw={700} c="gray.7" pb="sm">
                        {stepLabel}
                    </Text>
                )}
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />
                <Text size="sm" c="dimmed" mb="sm">
                    Include the code files you wish to run on the Data Organization&apos;s dataset. You can upload your
                    own files or write them directly in our Integrated Development Environment (IDE).
                </Text>
                <Alert variant="light" color="blue" icon={<LightbulbIcon size={16} />} mb="md">
                    The IDE is configured to help you write, edit, and test your code against sample data.
                </Alert>
                <Group justify="space-between" align="center" mb="md">
                    <Stack gap={4}>
                        <Text fw={600}>Upload or edit files</Text>
                        {starterCodeChips}
                    </Stack>
                    <Group>{launchButton}</Group>
                </Group>

                {body}
            </Paper>

            {footer}
        </>
    )
}
