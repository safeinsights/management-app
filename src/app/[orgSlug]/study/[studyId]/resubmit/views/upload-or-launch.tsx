'use client'

import { Alert, Divider, Group, Paper, Text, Title, useMantineTheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { LightbulbIcon } from '@phosphor-icons/react'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from '@/components/study/study-upload-buttons'
import { OpenStaxOnly, isOpenStaxOrg } from '@/components/openstax-only'
import { useResubmitCode } from '@/contexts/resubmit-code'
import { UploadFilesModal } from './upload-files-modal'

export function UploadOrLaunch() {
    const theme = useMantineTheme()
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useDisclosure(true)

    const {
        studyId,
        orgSlug,
        submittingOrgSlug,
        language,
        uploadedFiles,
        isIDELoading,
        launchError,
        isPending,
        launchWorkspace,
        setUploadedFiles,
        goToReview,
    } = useResubmitCode()

    const isOpenstax = isOpenStaxOrg(orgSlug)

    const handleConfirmAndProceed = (files: File[], mainFileName: string) => {
        setUploadedFiles(files, mainFileName)
        goToReview()
        closeModal()
    }

    return (
        <>
            <Paper p="xl">
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
                            onClick={launchWorkspace}
                            language={language}
                            loading={isIDELoading}
                            error={!!launchError}
                        />
                    </OpenStaxOnly>
                </Group>
            </Paper>

            <Group justify="flex-end" mt="md">
                <ResubmitCancelButton
                    isDirty={uploadedFiles.length > 0}
                    disabled={isPending}
                    href={Routes.studyView({ orgSlug: submittingOrgSlug, studyId })}
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
