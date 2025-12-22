'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Paper, Stack, Text, Title, Divider, Alert, useMantineTheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon, LightbulbIcon } from '@phosphor-icons/react'
import { Language } from '@/database/types'
import { Routes } from '@/lib/routes'
import { OpenStaxOnly, isOpenStaxOrg } from '@/components/openstax-only'
import { useStudyRequest } from '@/contexts/study-request'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from '@/components/study/study-upload-buttons'
import { CodeUploadModal } from './code-upload-modal'
import { CodeFilesReview } from './code-files-review'

interface CodeUploadPageProps {
    studyId: string
    orgSlug: string
    submittingOrgSlug: string
    language: Language
    existingMainFile?: string | null
    existingAdditionalFiles?: string[]
}

export function CodeUploadPage({
    studyId,
    orgSlug,
    submittingOrgSlug,
    language,
    existingMainFile,
    existingAdditionalFiles,
}: CodeUploadPageProps) {
    const router = useRouter()
    const theme = useMantineTheme()
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useDisclosure(true)

    // Context
    const { codeFiles, codeUploadViewMode, canProceedToReview, setStudyId, setCodeUploadViewMode } = useStudyRequest()

    // IDE launcher
    const {
        launchWorkspace,
        isLaunching,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({
        studyId,
        onSuccess: () => {
            router.push(Routes.studySelectFiles({ orgSlug: submittingOrgSlug, studyId }))
        },
    })

    // Initialize context from server data on mount
    useEffect(() => {
        setStudyId(studyId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studyId])

    const isOpenstax = isOpenStaxOrg(orgSlug)
    const isIDELoading = isLaunching || isCreatingWorkspace

    const handleLaunchIDE = () => {
        launchWorkspace()
    }

    const handleProceedToReview = () => {
        router.push(Routes.studyReview({ orgSlug: submittingOrgSlug, studyId }))
    }

    const handleBackToEdit = () => {
        router.push(Routes.studyEdit({ orgSlug: submittingOrgSlug, studyId }))
    }

    const handleBackToUpload = () => {
        setCodeUploadViewMode('upload')
    }

    const handleFilesConfirmed = () => {
        setCodeUploadViewMode('review')
        closeModal()
    }

    // Show review mode if files are selected
    if (codeUploadViewMode === 'review' && codeFiles.mainFile) {
        return <CodeFilesReview onBack={handleBackToUpload} onProceed={handleProceedToReview} />
    }

    return (
        <>
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 2 of 3
                </Text>
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />
                <Text mb={isOpenstax && isAlertVisible ? '' : 'xl'}>
                    Include the code files you wish to run on the Data Organization&apos;s dataset.{' '}
                    <OpenStaxOnly orgSlug={orgSlug}>
                        You can either upload your own files or write them in our{' '}
                        <Text component="span" fw={600}>
                            Integrated Development Environment (IDE).
                        </Text>
                    </OpenStaxOnly>
                </Text>

                <OpenStaxOnly orgSlug={orgSlug}>
                    {isAlertVisible && (
                        <Alert
                            icon={<LightbulbIcon weight="fill" color={theme.colors.green[9]} />}
                            title="Helpful tip"
                            color="green"
                            withCloseButton
                            onClose={setIsAlertVisible.close}
                            mt="md"
                            mb="xl"
                            styles={{
                                body: { gap: 8 },
                                title: { color: theme.colors.green[9] },
                                closeButton: { color: theme.colors.green[9] },
                            }}
                        >
                            IDE is pre-configured to help you write your code and test it against sample data.
                        </Alert>
                    )}
                </OpenStaxOnly>

                <Group align="center">
                    <UploadFilesButton onClick={openModal} language={language} />

                    <OpenStaxOnly orgSlug={orgSlug}>
                        <OrDivider />
                        <LaunchIDEButton
                            onClick={handleLaunchIDE}
                            language={language}
                            loading={isIDELoading}
                            error={!!launchError}
                        />
                    </OpenStaxOnly>
                </Group>

                {/* Show existing files info if any */}
                {existingMainFile && !codeFiles.mainFile && (
                    <Stack mt="xl" gap="xs">
                        <Text size="sm" c="dimmed">
                            Previously uploaded files:
                        </Text>
                        <Text size="sm">
                            Main file: <strong>{existingMainFile}</strong>
                        </Text>
                        {existingAdditionalFiles && existingAdditionalFiles.length > 0 && (
                            <Text size="sm">Additional files: {existingAdditionalFiles.join(', ')}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                            Upload new files to replace these, or proceed to review with existing files.
                        </Text>
                    </Stack>
                )}
            </Paper>

            <Group mt="xxl" style={{ width: '100%' }}>
                <Group style={{ marginLeft: 'auto' }}>
                    <Button
                        type="button"
                        size="md"
                        variant="subtle"
                        onClick={handleBackToEdit}
                        leftSection={<CaretLeftIcon />}
                    >
                        Previous
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        size="md"
                        disabled={!canProceedToReview && !existingMainFile}
                        onClick={handleProceedToReview}
                    >
                        Proceed to review
                    </Button>
                </Group>
            </Group>

            <CodeUploadModal
                isOpen={isModalOpen}
                onClose={closeModal}
                language={language}
                onConfirm={handleFilesConfirmed}
            />
        </>
    )
}
