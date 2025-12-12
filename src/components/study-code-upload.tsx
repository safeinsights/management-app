import { Language } from '@/database/types'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { getAcceptedFormatsForLanguage } from '@/lib/languages'
import { InputError } from '@/components/errors'
import { handleDuplicateUpload } from '@/hooks/file-upload'
import { ACCEPTED_FILE_TYPES } from '@/lib/types'
import {
    ActionIcon,
    Alert,
    Button,
    Divider,
    Grid,
    GridCol,
    Group,
    Paper,
    useMantineTheme,
    Stack,
    Text,
    Title,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { FileArrowUpIcon, UploadIcon, XCircleIcon, XIcon, CheckCircleIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, useState, useEffect } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { UseFormReturnType } from '@mantine/form'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import { LightbulbIcon } from '@phosphor-icons/react'
import { uniqueBy } from 'remeda'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from './study/study-upload-buttons'

interface StudyCodeUploadProps {
    studyUploadForm?: UseFormReturnType<StudyJobCodeFilesValues> | null
    stepIndicator?: string
    title?: string
    language: Language
    orgSlug: string
    studyId?: string | null
    onBeforeLaunchIDE?: () => Promise<string | null> // Returns studyId after saving draft, or null if failed
    onIDELaunched?: () => void // Called when IDE launch is initiated
    onIDELoadingChange?: (loading: boolean) => void // Called when IDE loading state changes
}

export const StudyCodeUpload = ({
    stepIndicator,
    title = 'Study code',
    language,
    orgSlug,
    studyId,
    onBeforeLaunchIDE,
    onIDELaunched,
    onIDELoadingChange,
    studyUploadForm,
}: StudyCodeUploadProps) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useState(true)
    const [effectiveStudyId, setEffectiveStudyId] = useState<string | null>(studyId ?? null)
    const theme = useMantineTheme()

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({
        studyId: effectiveStudyId ?? '',
    })

    const handleConfirmAndProceed = () => {
        // TODO: Implement logic to proceed with the study code upload
        closeModal()
    }

    const handleLaunchIDE = async () => {
        let idToUse = effectiveStudyId ?? studyId

        // If no studyId yet, call onBeforeLaunchIDE to save draft first
        if (!idToUse && onBeforeLaunchIDE) {
            idToUse = await onBeforeLaunchIDE()
            if (idToUse) {
                setEffectiveStudyId(idToUse)
            }
        }

        if (idToUse) {
            launchWorkspace()
            onIDELaunched?.()
        }
    }

    const isOpenstaxOrg = orgSlug === OPENSTAX_ORG_SLUG
    const isIDELoading = isLaunchingWorkspace || isCreatingWorkspace

    useEffect(() => {
        onIDELoadingChange?.(isIDELoading)
    }, [isIDELoading, onIDELoadingChange])

    return (
        <Paper p="xl">
            {stepIndicator && (
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    {stepIndicator}
                </Text>
            )}
            <Title order={4}>{title}</Title>
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
                    onClose={() => setIsAlertVisible(false)}
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
                {studyUploadForm && (
                    <UploadFilesButton onClick={openModal} language={language} />
                )}

                {isOpenstaxOrg && (
                    <>
                        {studyUploadForm && <OrDivider />}
                        <LaunchIDEButton
                            onClick={handleLaunchIDE}
                            language={language}
                            loading={isIDELoading}
                            error={!!launchError}
                        />
                    </>
                )}
            </Group>

            {studyUploadForm && (
                <StudyCodeUploadModal
                    onClose={closeModal}
                    isOpen={isModalOpen}
                    onConfirmAndClose={handleConfirmAndProceed}
                    studyUploadForm={studyUploadForm}
                    language={language}
                />
            )}
        </Paper>
    )
}

const StudyCodeUploadModal: FC<{
    onClose: () => void
    isOpen: boolean
    onConfirmAndClose: () => void
    studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues>
    language: Language
}> = ({ onClose, isOpen, onConfirmAndClose, studyUploadForm, language }) => {
    const theme = useMantineTheme()
    const removeAdditionalFiles = (fileToRemove: File) => {
        const updatedAdditionalFiles = studyUploadForm
            .getValues()
            .additionalCodeFiles.filter((file) => file.name !== fileToRemove.name)
        studyUploadForm.setFieldValue('additionalCodeFiles', updatedAdditionalFiles)
        studyUploadForm.validateField('totalFileSize')
    }

    return (
        <AppModal size="xl" isOpen={isOpen} onClose={onClose} title="Upload your code files">
            <Stack>
                <Group gap={0}>
                    <Text size="sm">Upload your code file(s).</Text>
                </Group>
                <Group grow justify="center" align="center" mt="md">
                    <Grid>
                        <GridCol span={{ base: 6, md: 5 }}>
                            <Dropzone
                                name="additionalCodeFiles"
                                onDrop={(files) => {
                                    const { additionalCodeFiles: previousFiles, mainCodeFile } =
                                        studyUploadForm.getValues()

                                    handleDuplicateUpload(mainCodeFile, files)

                                    const filteredFiles = mainCodeFile
                                        ? files.filter((f) => f.name !== mainCodeFile.name)
                                        : files

                                    const additionalFiles = uniqueBy(
                                        [...filteredFiles, ...previousFiles],
                                        (file) => file.name,
                                    )
                                    studyUploadForm.setFieldValue('additionalCodeFiles', additionalFiles)
                                    studyUploadForm.validateField('totalFileSize')
                                }}
                                onReject={(rejections) =>
                                    notifications.show({
                                        color: 'red',
                                        title: 'Rejected files',
                                        message: rejections
                                            .map(
                                                (rej) =>
                                                    `${rej.file.name} ${rej.errors
                                                        .map((err) => `${err.code}: ${err.message}`)
                                                        .join(', ')}`,
                                            )
                                            .join('\n'),
                                    })
                                }
                                multiple={true}
                                maxFiles={10}
                                accept={ACCEPTED_FILE_TYPES}
                                p="xl"
                            >
                                <Dropzone.Accept>
                                    <UploadIcon />
                                </Dropzone.Accept>
                                <Dropzone.Reject>
                                    <XIcon />
                                </Dropzone.Reject>
                                <Dropzone.Idle>
                                    <Stack>
                                        <Group gap="xs">
                                            <FileArrowUpIcon size={32} />
                                            <Text size="sm" c="dimmed">
                                                Drop your files or
                                            </Text>
                                            <Text fz="sm" c="purple.6" fw="bold">
                                                Browse
                                            </Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                            {getAcceptedFormatsForLanguage(language)}
                                        </Text>
                                    </Stack>
                                </Dropzone.Idle>
                            </Dropzone>
                        </GridCol>
                        <Divider orientation="vertical" />
                        <GridCol span={{ base: 4, md: 6 }}>
                            <Title order={5}>Uploaded files</Title>
                            {studyUploadForm.getValues().additionalCodeFiles.map((file) => (
                                <Group key={file.name} gap="md" w="100%">
                                    <Group>
                                        <CheckCircleIcon weight="fill" color="#2F9844" />
                                        <Text>{file.name}</Text>
                                    </Group>
                                    <ActionIcon
                                        variant="transparent"
                                        aria-label={`Remove file ${file.name}`}
                                        onClick={() => removeAdditionalFiles(file)}
                                    >
                                        <XCircleIcon color={theme.colors.grey[2]} weight="bold" />
                                    </ActionIcon>
                                </Group>
                            ))}
                        </GridCol>
                        {studyUploadForm.errors['totalFileSize'] && (
                            <GridCol>
                                <InputError error={studyUploadForm.errors['totalFileSize']} />
                            </GridCol>
                        )}
                    </Grid>
                </Group>

                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel upload
                    </Button>
                    <Button onClick={onConfirmAndClose}>Done</Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
