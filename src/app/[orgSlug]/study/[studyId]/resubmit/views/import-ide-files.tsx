'use client'

import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { CompactStatusButton } from '@/components/study/compact-status-button'
import { FileReviewTable } from '@/components/study/file-review-table'
import { useResubmitCodeStore } from '@/stores/resubmit-code.store'

interface ImportIDEFilesProps {
    studyId: string
    orgSlug: string
    filteredIdeFiles: string[]
    currentIdeMainFile: string
    lastModified: string | null
    showEmptyState: boolean
    isLoadingFiles: boolean
    isIDELoading: boolean
    ideLoadingMessage: string
    launchError: Error | null
    canSubmitFromIDE: boolean
    isPending: boolean
    onLaunchWorkspace: () => void
    onImportFiles: () => void
    onResubmit: () => void
}

export function ImportIDEFiles({
    studyId,
    orgSlug,
    filteredIdeFiles,
    currentIdeMainFile,
    lastModified,
    showEmptyState,
    isLoadingFiles,
    isIDELoading,
    ideLoadingMessage,
    launchError,
    canSubmitFromIDE,
    isPending,
    onLaunchWorkspace,
    onImportFiles,
    onResubmit,
}: ImportIDEFilesProps) {
    const store = useResubmitCodeStore()

    let launchButton = (
        <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={onLaunchWorkspace}>
            Launch IDE
        </Button>
    )
    if (launchError) {
        launchButton = (
            <CompactStatusButton
                icon={<WarningCircleIcon size={14} weight="fill" />}
                primaryText="Launch failed"
                secondaryText="Please try again later"
                color="red"
                onClick={onLaunchWorkspace}
            />
        )
    } else if (isIDELoading) {
        launchButton = <CompactStatusButton primaryText="Launching IDE" secondaryText={ideLoadingMessage} loading />
    }

    let body = (
        <FileReviewTable
            files={filteredIdeFiles}
            mainFile={currentIdeMainFile}
            onMainFileChange={store.setIdeMainFile}
            onRemoveFile={store.removeIdeFile}
            lastModified={lastModified}
        />
    )
    if (showEmptyState) {
        body = (
            <Box bg="gray.1" py={60} style={{ borderRadius: 8 }}>
                <Stack align="center" gap="md">
                    <Text c="dimmed">
                        {isLoadingFiles ? 'Loading files...' : 'You have not imported any files yet.'}
                    </Text>
                    {!isLoadingFiles && (
                        <Button
                            variant="transparent"
                            leftSection={<DownloadSimpleIcon size={16} />}
                            onClick={onImportFiles}
                            loading={isLoadingFiles}
                        >
                            Import files from IDE
                        </Button>
                    )}
                </Stack>
            </Box>
        )
    }

    return (
        <Paper p="xl">
            <Stack gap="md">
                <Title order={4}>Study code</Title>
                <Divider />

                <Group justify="space-between" align="center">
                    <Text fw={600}>Review files from IDE</Text>
                    <Group>
                        {launchButton}
                        <Button
                            variant="filled"
                            leftSection={<DownloadSimpleIcon size={16} />}
                            onClick={onImportFiles}
                            loading={isLoadingFiles}
                        >
                            Import files from IDE
                        </Button>
                    </Group>
                </Group>

                {body}

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={store.goToUpload}>
                        Back
                    </Button>
                    <ResubmitCancelButton
                        isDirty={filteredIdeFiles.length > 0}
                        disabled={isPending}
                        href={Routes.studyView({ orgSlug, studyId })}
                    />
                    <Button onClick={onResubmit} disabled={!canSubmitFromIDE} loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </Paper>
    )
}
