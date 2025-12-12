'use client'

import { useIDEFiles } from '@/hooks/use-ide-files'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import {
    ArrowSquareOutIcon,
    CaretLeftIcon,
    DownloadSimpleIcon,
    WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr'
import { CompactStatusButton } from './compact-status-button'
import { FileReviewTable } from './file-review-table'

interface StudyCodeFromIDEProps {
    studyId: string
    orgSlug: string
}

export const StudyCodeFromIDE = ({ studyId, orgSlug }: StudyCodeFromIDEProps) => {
    const ide = useIDEFiles({ studyId, orgSlug })
    const { messageWithEllipsis } = useLoadingMessages(ide.isLaunching)

    let launchButton = (
        <Button variant="outline" rightSection={<ArrowSquareOutIcon size={16} />} onClick={ide.launchWorkspace}>
            Launch IDE
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
        <FileReviewTable
            files={ide.files}
            mainFile={ide.mainFile}
            onMainFileChange={ide.setMainFile}
            onRemoveFile={ide.removeFile}
            lastModified={ide.lastModified}
        />
    )
    if (ide.showEmptyState) {
        body = (
            <Box bg="gray.1" py={60} style={{ borderRadius: 8 }}>
                <Stack align="center" gap="md">
                    <Text c="dimmed">
                        {ide.isLoadingFiles ? 'Loading files...' : 'You have not imported any files yet.'}
                    </Text>
                    {!ide.isLoadingFiles && (
                        <Button
                            variant="transparent"
                            leftSection={<DownloadSimpleIcon size={16} />}
                            onClick={ide.importFiles}
                            loading={ide.isLoadingFiles}
                        >
                            Import files from IDE
                        </Button>
                    )}
                </Stack>
            </Box>
        )
    }

    return (
        <>
            <Title order={1}>Select files to submit</Title>

            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    STEP 5 of 5
                </Text>
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />

                <Group justify="space-between" align="center" mb="md">
                    <Text fw={600}>Review files from IDE</Text>
                    <Group>
                        {launchButton}
                        <Button
                            variant="filled"
                            leftSection={<DownloadSimpleIcon size={16} />}
                            onClick={ide.importFiles}
                            loading={ide.isLoadingFiles}
                        >
                            Import files from IDE
                        </Button>
                    </Group>
                </Group>

                {body}
            </Paper>

            <Group justify="space-between">
                <Button
                    variant="subtle"
                    leftSection={<CaretLeftIcon />}
                    onClick={ide.goBack}
                    disabled={ide.isSubmitting}
                >
                    Back to upload
                </Button>

                <Button
                    variant="primary"
                    disabled={!ide.canSubmit}
                    loading={ide.isSubmitting}
                    onClick={() => ide.submit()}
                >
                    Submit Study
                </Button>
            </Group>
        </>
    )
}
