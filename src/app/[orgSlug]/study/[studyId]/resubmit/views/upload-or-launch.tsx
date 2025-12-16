'use client'

import { Alert, Divider, Group, Paper, Text, Title, useMantineTheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { LightbulbIcon } from '@phosphor-icons/react'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from '@/components/study/study-upload-buttons'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { Language } from '@/database/types'
import { UploadFilesModal } from './upload-files-modal'
import { useResubmitCodeStore } from '@/stores/resubmit-code.store'

interface UploadOrLaunchProps {
    studyId: string
    orgSlug: string
    studyOrgSlug: string
    language: Language
    uploadedFiles: File[]
    isIDELoading: boolean
    launchError: Error | null
    isPending: boolean
    onLaunchWorkspace: () => void
}

export function UploadOrLaunch({
    studyId,
    orgSlug,
    studyOrgSlug,
    language,
    uploadedFiles,
    isIDELoading,
    launchError,
    isPending,
    onLaunchWorkspace,
}: UploadOrLaunchProps) {
    const theme = useMantineTheme()
    const store = useResubmitCodeStore()
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useDisclosure(true)

    const isOpenstaxOrg = studyOrgSlug === OPENSTAX_ORG_SLUG

    const handleConfirmAndProceed = (files: File[], mainFileName: string) => {
        store.setUploadedFiles(files, mainFileName)
        store.goToReview()
        closeModal()
    }

    return (
        <>
            <Paper p="xl">
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
                                onClick={onLaunchWorkspace}
                                language={language}
                                loading={isIDELoading}
                                error={!!launchError}
                            />
                        </>
                    )}
                </Group>
            </Paper>

            <Group justify="flex-end" mt="md">
                <ResubmitCancelButton
                    isDirty={uploadedFiles.length > 0}
                    disabled={isPending}
                    href={Routes.studyView({ orgSlug, studyId })}
                />
            </Group>

            <UploadFilesModal
                isOpen={isModalOpen}
                onClose={closeModal}
                language={language}
                onConfirmAndProceed={handleConfirmAndProceed}
            />
        </>
    )
}
