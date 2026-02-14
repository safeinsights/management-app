'use client'

import { useEffect } from 'react'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, CaretLeftIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { CompactStatusButton } from '@/components/study/compact-status-button'
import { FileReviewTable } from '@/components/study/file-review-table'
import { useResubmitCode } from '@/contexts/resubmit-code'

export function ImportFromIDE() {
    const {
        studyId,
        submittingOrgSlug,
        filteredIdeFiles,
        currentIdeMainFile,
        hasImportedFromIDE,
        lastModified,
        isLoadingFiles,
        showEmptyState,
        canSubmitFromIDE,
        isIDELoading,
        ideLoadingMessage,
        launchError,
        isPending,
        setIdeMainFile,
        removeIdeFile,
        handleImportFiles,
        launchWorkspace,
        goToUpload,
        resubmitStudy,
    } = useResubmitCode()

    useEffect(() => {
        if (!hasImportedFromIDE) {
            handleImportFiles()
        }
    }, [hasImportedFromIDE, handleImportFiles])

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
                    <Text c="dimmed">{isLoadingFiles ? 'Loading files...' : 'No files found in workspace.'}</Text>
                </Stack>
            </Box>
        )
    }

    return (
        <>
            <Paper p="xl">
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />

                <Group justify="space-between" align="center" mb="md">
                    <Text fw={600}>Review files from IDE</Text>
                    <Group>{launchButton}</Group>
                </Group>

                {body}
            </Paper>

            <Group justify="space-between" mt="md">
                <Button variant="subtle" leftSection={<CaretLeftIcon />} onClick={goToUpload}>
                    Back to upload
                </Button>

                <Group>
                    <ResubmitCancelButton
                        isDirty={filteredIdeFiles.length > 0}
                        disabled={isPending}
                        href={Routes.studyView({ orgSlug: submittingOrgSlug, studyId })}
                    />
                    <Button onClick={resubmitStudy} disabled={!canSubmitFromIDE} loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Group>
        </>
    )
}
