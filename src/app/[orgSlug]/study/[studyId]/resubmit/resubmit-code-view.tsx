'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, DownloadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { CompactStatusButton } from '@/components/study/compact-status-button'
import { FileReviewTable } from '@/components/study/file-review-table'
import { FileDropOverlay } from '@/components/study/file-drop-overlay'

interface ResubmitCodeViewProps {
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
}

export function ResubmitCodeView({ studyId, submittingOrgSlug }: ResubmitCodeViewProps) {
    const router = useRouter()

    const onSubmitSuccess = useCallback(() => {
        router.push(Routes.studyView({ orgSlug: submittingOrgSlug, studyId }))
    }, [router, submittingOrgSlug, studyId])

    const ide = useIDEFiles({ studyId, onSubmitSuccess })
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
                        <Text c="dimmed">{ide.isLoadingFiles ? 'Loading files...' : 'No files found yet.'}</Text>
                    </Stack>
                </Box>
            </FileDropOverlay>
        )
    }

    return (
        <>
            <Paper p="xl">
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />
                <Group justify="space-between" align="center" mb="md">
                    <Text fw={600}>Review files</Text>
                    <Group>
                        {ide.starterCodeUrl && (
                            <Button
                                component="a"
                                href={ide.starterCodeUrl}
                                variant="subtle"
                                rightSection={<DownloadSimpleIcon size={16} />}
                            >
                                Download starter code
                            </Button>
                        )}
                        {launchButton}
                    </Group>
                </Group>

                {body}
            </Paper>

            <Group justify="flex-end" mt="md">
                <ResubmitCancelButton
                    isDirty={ide.files.length > 0}
                    disabled={ide.isDirectSubmitting}
                    href={Routes.studyView({ orgSlug: submittingOrgSlug, studyId })}
                />
                <Stack align="flex-end" gap="xs">
                    {ide.submitDisabledReason && (
                        <Text size="sm" c="dimmed">
                            {ide.submitDisabledReason}
                        </Text>
                    )}
                    <Button onClick={ide.submitDirectly} disabled={!ide.canSubmit} loading={ide.isDirectSubmitting}>
                        Resubmit study code
                    </Button>
                </Stack>
            </Group>
        </>
    )
}
