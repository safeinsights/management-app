'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, Paper, Stack, Text, Title, Divider, Alert, useMantineTheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { CaretLeftIcon, LightbulbIcon } from '@phosphor-icons/react'
import { Language } from '@/database/types'
import { Routes } from '@/lib/routes'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { useStudyRequestStore, useCodeFiles, useCanProceedToReview } from '@/stores/study-request.store'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from '@/components/study/study-upload-buttons'
import { CodeUploadModal } from './step2-upload-modal'
import { CodeFilesReview } from './step2-files-review'

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

    // Zustand store
    const store = useStudyRequestStore()
    const codeFiles = useCodeFiles()
    const viewMode = store.codeUploadViewMode
    const canProceedToReview = useCanProceedToReview()

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

    // Initialize store from server data on mount
    useEffect(() => {
        store.setStudyId(studyId)
        store.setOrgSlug(orgSlug)
        store.setSubmittingOrgSlug(submittingOrgSlug)
        store.setLanguage(language)

        // Set existing files if any (from a previous draft save)
        if (existingMainFile || (existingAdditionalFiles && existingAdditionalFiles.length > 0)) {
            // Only initialize if we don't already have files in memory
            if (!codeFiles.mainFile) {
                // These are server files - we can't upload them again, just show their names
                // User will need to re-upload if they want to change them
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [studyId])

    const isOpenstaxOrg = orgSlug === OPENSTAX_ORG_SLUG
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
        store.setCodeUploadViewMode('upload')
    }

    const handleFilesConfirmed = () => {
        store.setCodeUploadViewMode('review')
        closeModal()
    }

    // Show review mode if files are selected
    if (viewMode === 'review' && codeFiles.mainFile) {
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
                <Text mb={isOpenstaxOrg && isAlertVisible ? '' : 'xl'}>
                    Include the code files you wish to run on the Data Organization&apos;s dataset.{' '}
                    {isOpenstaxOrg && (
                        <>
                            You can either upload your own files or write them in our{' '}
                            <Text component="span" fw={600}>
                                Integrated Development Environment (IDE).
                            </Text>
                        </>
                    )}
                </Text>

                {isOpenstaxOrg && isAlertVisible && (
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

                <Group align="center">
                    <UploadFilesButton onClick={openModal} language={language} />

                    {isOpenstaxOrg && (
                        <>
                            <OrDivider />
                            <LaunchIDEButton
                                onClick={handleLaunchIDE}
                                language={language}
                                loading={isIDELoading}
                                error={!!launchError}
                            />
                        </>
                    )}
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
