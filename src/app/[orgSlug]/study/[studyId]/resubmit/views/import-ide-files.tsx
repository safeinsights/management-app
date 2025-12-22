'use client'

import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { CompactStatusButton } from '@/components/study/compact-status-button'
import { FileReviewTable } from '@/components/study/file-review-table'
import { OpenStaxOnly } from '@/components/openstax-only'
import { useResubmitCode } from '@/contexts/resubmit-code'

export function ImportIDEFiles() {
    const {
        studyId,
        orgSlug,
        submittingOrgSlug,
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
        goToUpload,
        setIdeMainFile,
        removeIdeFile,
        launchWorkspace,
        handleImportFiles,
        resubmitStudy,
    } = useResubmitCode()

    let launchButton = (
        <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={launchWorkspace}>
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
                onClick={launchWorkspace}
            />
        )
    } else if (isIDELoading) {
        launchButton = <CompactStatusButton primaryText="Launching IDE" secondaryText={ideLoadingMessage} loading />
    }

    let body = (
        <FileReviewTable
            files={filteredIdeFiles}
            mainFile={currentIdeMainFile}
            onMainFileChange={setIdeMainFile}
            onRemoveFile={removeIdeFile}
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
                            onClick={handleImportFiles}
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
                    <OpenStaxOnly orgSlug={orgSlug}>
                        <Group>
                            {launchButton}
                            <Button
                                variant="filled"
                                leftSection={<DownloadSimpleIcon size={16} />}
                                onClick={handleImportFiles}
                                loading={isLoadingFiles}
                            >
                                Import files from IDE
                            </Button>
                        </Group>
                    </OpenStaxOnly>
                </Group>

                {body}

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={goToUpload}>
                        Back
                    </Button>
                    <ResubmitCancelButton
                        isDirty={filteredIdeFiles.length > 0}
                        disabled={isPending}
                        href={Routes.studyView({ orgSlug: submittingOrgSlug, studyId })}
                    />
                    <Button onClick={resubmitStudy} disabled={!canSubmitFromIDE} loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </Paper>
    )
}
