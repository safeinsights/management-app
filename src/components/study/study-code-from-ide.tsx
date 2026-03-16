'use client'

import type { Route } from 'next'
import { useIDEFiles } from '@/hooks/use-ide-files'
import { useLoadingMessages } from '@/hooks/use-loading-messages'
import { Box, Button, Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon, CaretLeftIcon, WarningCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { ButtonLink } from '@/components/links'
import { CompactStatusButton } from './compact-status-button'
import { FileReviewTable } from './file-review-table'
import { OpenStaxOnly } from '@/components/openstax-only'

interface StudyCodeFromIDEProps {
    studyId: string
    studyOrgSlug: string
    previousHref: Route
}

export const StudyCodeFromIDE = ({ studyId, studyOrgSlug, previousHref }: StudyCodeFromIDEProps) => {
    const ide = useIDEFiles({ studyId })
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
                    <Text c="dimmed">{ide.isLoadingFiles ? 'Loading files...' : 'No files found in workspace.'}</Text>
                </Stack>
            </Box>
        )
    }

    return (
        <>
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    STEP 4 of 4
                </Text>
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />
                <Group justify="space-between" align="center" mb="md">
                    <Text fw={600}>Review files from IDE</Text>
                    <OpenStaxOnly orgSlug={studyOrgSlug}>
                        <Group>{launchButton}</Group>
                    </OpenStaxOnly>
                </Group>

                {body}
            </Paper>

            <Group mt="xxl" justify="space-between" w="100%">
                <ButtonLink href={previousHref} size="md" variant="subtle" leftSection={<CaretLeftIcon />}>
                    Previous
                </ButtonLink>
                <Group>
                    <Button variant="subtle" leftSection={<CaretLeftIcon />} onClick={ide.goBack}>
                        Back to upload
                    </Button>
                    <Button
                        variant="primary"
                        disabled={!ide.canSubmit}
                        loading={ide.isDirectSubmitting}
                        onClick={ide.submitDirectly}
                    >
                        Submit code
                    </Button>
                </Group>
            </Group>
        </>
    )
}
