import { Language } from '@/database/types'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { getAcceptedFormatsForLanguage } from '@/lib/languages'
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
    Radio,
    useMantineTheme,
    Stack,
    Text,
    Title,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { FileArrowUpIcon, UploadIcon, XCircleIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import { FC, useEffect, useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { LightbulbIcon } from '@phosphor-icons/react'
import { uniqueBy } from 'remeda'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from './study/study-upload-buttons'
import { ReviewUploadedFiles } from './study/review-uploaded-files'

// Interface for form operations we need - avoids complex generic typing
interface CodeFilesFormMethods {
    getValues: () => { mainCodeFile: File | null; additionalCodeFiles: File[] }
    setFieldValue: (field: string, value: File | null | File[]) => void
}

interface StudyCodeUploadProps {
    studyUploadForm?: CodeFilesFormMethods | null
    stepIndicator?: string
    title?: string
    language: Language
    orgSlug: string
    studyId: string
    onIDELaunched?: () => void
    onIDELoadingChange?: (loading: boolean) => void
    viewMode?: 'upload' | 'review'
    onViewModeChange?: (mode: 'upload' | 'review') => void
    onFilesUploaded?: (files: File[]) => void
    onProceed?: () => void
    isSubmitting?: boolean
}

export const StudyCodeUpload = ({
    stepIndicator,
    title = 'Study code',
    language,
    orgSlug,
    studyId,
    onIDELaunched,
    onIDELoadingChange,
    studyUploadForm,
    viewMode: externalViewMode,
    onViewModeChange,
    onFilesUploaded,
    onProceed,
    isSubmitting = false,
}: StudyCodeUploadProps) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useState(true)
    const [internalViewMode, setInternalViewMode] = useState<'upload' | 'review'>('upload')
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([])
    const theme = useMantineTheme()

    // Use external viewMode if provided, otherwise use internal state
    const viewMode = externalViewMode ?? internalViewMode

    const setViewMode = (mode: 'upload' | 'review') => {
        if (onViewModeChange) {
            onViewModeChange(mode)
        } else {
            setInternalViewMode(mode)
        }
    }

    const {
        launchWorkspace,
        isLaunching: isLaunchingWorkspace,
        isCreatingWorkspace,
        error: launchError,
    } = useWorkspaceLauncher({ studyId })

    const handleLaunchIDE = () => {
        launchWorkspace()
        onIDELaunched?.()
    }

    const handleConfirmAndProceed = (files: File[], mainFileName: string) => {
        setUploadedFiles(files)
        const mainFile = files.find((f) => f.name === mainFileName) || null
        const additionalFiles = files.filter((f) => f.name !== mainFileName)

        studyUploadForm?.setFieldValue('mainCodeFile', mainFile)
        studyUploadForm?.setFieldValue('additionalCodeFiles', additionalFiles)

        // Notify parent of uploaded files
        onFilesUploaded?.(files)

        setViewMode('review')
        closeModal()
    }

    const handleBackToUpload = () => {
        setViewMode('upload')
    }

    const handleSaveAndProceed = (mainFileName: string) => {
        // Update the form with the correct main file based on user's selection in review
        const mainFile = uploadedFiles.find((f) => f.name === mainFileName) || null
        const additionalFiles = uploadedFiles.filter((f) => f.name !== mainFileName)

        studyUploadForm?.setFieldValue('mainCodeFile', mainFile)
        studyUploadForm?.setFieldValue('additionalCodeFiles', additionalFiles)

        // Call onProceed - parent will handle navigation to next step
        onProceed?.()
    }

    const isOpenstaxOrg = orgSlug === OPENSTAX_ORG_SLUG
    const isIDELoading = isLaunchingWorkspace || isCreatingWorkspace

    useEffect(() => {
        onIDELoadingChange?.(isIDELoading)
    }, [isIDELoading, onIDELoadingChange])

    const handleSaveAndProceed = (mainFileName: string) => {
        // update form with the correct main file based on user's selection in review
        const mainFile = uploadedFiles.find((f) => f.name === mainFileName) || null
        const additionalFiles = uploadedFiles.filter((f) => f.name !== mainFileName)

        studyUploadForm?.setFieldValue('mainCodeFile', mainFile)
        studyUploadForm?.setFieldValue('additionalCodeFiles', additionalFiles)

        onProceed?.(mainFileName)
    }

    if (viewMode === 'review') {
        return (
            <ReviewUploadedFiles
                files={uploadedFiles}
                setFiles={setUploadedFiles}
                onBack={handleBackToUpload}
                onSaveAndProceed={handleSaveAndProceed}
                orgSlug={orgSlug}
                studyId={studyId}
                isSaving={isSubmitting}
            />
        )
    }

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
                {studyUploadForm && <UploadFilesButton onClick={openModal} language={language} />}

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
                    studyUploadForm={studyUploadForm}
                    language={language}
                    onConfirmAndProceed={handleConfirmAndProceed}
                />
            )}
        </Paper>
    )
}

const StudyCodeUploadModal: FC<{
    onClose: () => void
    isOpen: boolean
    studyUploadForm: CodeFilesFormMethods
    language: Language
    onConfirmAndProceed: (files: File[], mainFileName: string) => void
}> = ({ onClose, isOpen, studyUploadForm, language, onConfirmAndProceed }) => {
    const theme = useMantineTheme()
    const [selectedMainFile, setSelectedMainFile] = useState<string>('')

    // Get all files (additionalCodeFiles) - needs fresh values each render
    const formValues = studyUploadForm.getValues()
    const allFiles: File[] = formValues.additionalCodeFiles

    const removeFile = (fileToRemove: File) => {
        const currentValues = studyUploadForm.getValues()
        const updatedAdditionalFiles = currentValues.additionalCodeFiles.filter(
            (file) => file.name !== fileToRemove.name,
        )
        studyUploadForm.setFieldValue('additionalCodeFiles', updatedAdditionalFiles)
        // If removed file was the selected main file, clear selection
        if (selectedMainFile === fileToRemove.name) {
            setSelectedMainFile('')
        }
    }

    const handleDone = () => {
        // Get fresh file list at the time of clicking Done
        const currentValues = studyUploadForm.getValues()
        const currentFiles = currentValues.additionalCodeFiles

        if (!selectedMainFile || currentFiles.length === 0) return

        onConfirmAndProceed(currentFiles, selectedMainFile)
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
                                    const currentValues = studyUploadForm.getValues()
                                    const previousFiles = currentValues.additionalCodeFiles
                                    const mainCodeFile = currentValues.mainCodeFile

                                    handleDuplicateUpload(mainCodeFile, files)

                                    const filteredFiles = mainCodeFile
                                        ? files.filter((f) => f.name !== mainCodeFile.name)
                                        : files

                                    const additionalFiles = uniqueBy(
                                        [...filteredFiles, ...previousFiles],
                                        (file) => file.name,
                                    )
                                    studyUploadForm.setFieldValue('additionalCodeFiles', additionalFiles)
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
                            <Text size="xs" c="dimmed" mb="sm">
                                Select the main file to run
                            </Text>
                            <Radio.Group value={selectedMainFile} onChange={setSelectedMainFile}>
                                <Stack gap="xs">
                                    {allFiles.map((file) => (
                                        <Group key={file.name} gap="md" w="100%" justify="space-between">
                                            <Group gap="sm">
                                                <Radio value={file.name} label={file.name} />
                                            </Group>
                                            <ActionIcon
                                                variant="transparent"
                                                aria-label={`Remove file ${file.name}`}
                                                onClick={() => removeFile(file)}
                                            >
                                                <XCircleIcon color={theme.colors.grey[2]} weight="bold" />
                                            </ActionIcon>
                                        </Group>
                                    ))}
                                </Stack>
                            </Radio.Group>
                        </GridCol>
                    </Grid>
                </Group>

                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel upload
                    </Button>
                    <Button onClick={handleDone} disabled={!selectedMainFile || allFiles.length === 0}>
                        Done
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
