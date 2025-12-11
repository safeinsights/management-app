import { Language } from '@/database/types'
import {
    Alert,
    Button,
    Divider,
    Group,
    Paper,
    useMantineTheme,
    Stack,
    Text,
    Title,
    Grid,
    FileInput,
    ActionIcon,
} from '@mantine/core'
import { FC, useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { UseFormReturnType } from '@mantine/form'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import {
    AsteriskIcon,
    CheckCircleIcon,
    LightbulbIcon,
    UploadIcon,
    UploadSimpleIcon,
    XCircleIcon,
    XIcon,
} from '@phosphor-icons/react'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from './study/study-upload-buttons'
import { ReviewUploadedFiles } from './study/review-uploaded-files'
import { Dropzone } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { handleDuplicateUpload, useFileUploadIcons } from '@/hooks/file-upload'
import { ACCEPTED_FILE_FORMATS_TEXT, ACCEPTED_FILE_TYPES } from '@/lib/types'
import { FormFieldLabel } from './form-field-label'
import { InputError } from './errors'

interface StudyCodeUploadProps {
    studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues>
    showStepIndicator?: boolean
    title?: string
    language: Language
    orgSlug: string
    studyId?: string
    viewMode?: 'upload' | 'review'
    onViewModeChange?: (mode: 'upload' | 'review') => void
}

export const StudyCodeUpload = ({
    studyUploadForm,
    showStepIndicator = false,
    title = 'Study code',
    language,
    orgSlug,
    studyId,
    viewMode: externalViewMode,
    onViewModeChange,
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

    const handleConfirmAndProceed = (files: File[]) => {
        setUploadedFiles(files)
        const allFiles = [...files]
        const mainFile = allFiles.length > 0 ? allFiles[0] : null
        const additionalFiles = allFiles.slice(1)

        studyUploadForm.setFieldValue('mainCodeFile', mainFile)
        studyUploadForm.setFieldValue('additionalCodeFiles', additionalFiles)
        setViewMode('review')
        closeModal()
    }

    const handleLaunchIDE = () => {
        // TODO: Implement logic to launch the IDE
    }

    const handleBackToUpload = () => {
        setViewMode('upload')
    }

    const isOpenstaxOrg = orgSlug === OPENSTAX_ORG_SLUG

    if (viewMode === 'review') {
        return (
            <ReviewUploadedFiles
                files={uploadedFiles}
                setFiles={setUploadedFiles}
                onBack={handleBackToUpload}
                orgSlug={orgSlug}
                studyId={studyId || ''}
            />
        )
    }

    return (
        <Paper p="xl">
            {showStepIndicator && (
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 4 of 4
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
                <UploadFilesButton onClick={openModal} language={language} />

                {isOpenstaxOrg && (
                    <>
                        <OrDivider />
                        <LaunchIDEButton onClick={handleLaunchIDE} language={language} />
                    </>
                )}
            </Group>

            <StudyCodeUploadModal
                onClose={closeModal}
                isOpen={isModalOpen}
                onConfirmAndClose={handleConfirmAndProceed}
                studyUploadForm={studyUploadForm}
            />
        </Paper>
    )
}

const StudyCodeUploadModal: FC<{
    onClose: () => void
    isOpen: boolean
    onConfirmAndClose: (files: File[]) => void
    studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues>
}> = ({ onClose, isOpen, onConfirmAndClose, studyUploadForm }) => {
    const theme = useMantineTheme()
    const [mainCodeFile, setMainCodeFile] = useState<File | null>(studyUploadForm.values.mainCodeFile)
    const [additionalCodeFiles, setAdditionalCodeFiles] = useState<File[]>(studyUploadForm.values.additionalCodeFiles)
    const { getFileUploadIcon } = useFileUploadIcons()
    const mainFileUpload = getFileUploadIcon(theme.colors.blue[7], mainCodeFile?.name ?? '')

    const removeAdditionalFiles = (fileToRemove: File) => {
        const updatedAdditionalFiles = additionalCodeFiles.filter((file) => file.name !== fileToRemove.name)
        setAdditionalCodeFiles(updatedAdditionalFiles)
    }

    const handleDone = () => {
        const allFiles: File[] = []
        if (mainCodeFile) {
            allFiles.push(mainCodeFile)
        }
        allFiles.push(...additionalCodeFiles)
        onConfirmAndClose(allFiles)
    }

    const titleSpan = { base: 12, md: 2 }
    const inputSpan = { base: 12, md: 10 }

    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Upload your code files">
            <Stack>
                <Group grow justify="center" align="center">
                    <Grid>
                        <Grid.Col span={titleSpan}>
                            <Group gap="xs">
                                <FormFieldLabel label="Main code file" inputId="mainCodeFile" />
                                <AsteriskIcon size={14} color={theme.colors.red[5]} />
                            </Group>
                        </Grid.Col>
                        <Grid.Col span={inputSpan}>
                            <FileInput
                                name="mainCodeFile"
                                leftSection={mainFileUpload}
                                aria-label="Upload Main Code File"
                                placeholder="Upload Main Code File"
                                clearable
                                accept={'.r,.R,.rmd,.py,.ipynb'}
                                value={mainCodeFile}
                                onChange={(file) => {
                                    const isDuplicate = handleDuplicateUpload(file, additionalCodeFiles)

                                    if (isDuplicate) {
                                        setMainCodeFile(null)
                                        return
                                    }

                                    setMainCodeFile(file)
                                }}
                                autoFocus
                            />
                            <Text size="xs" c="dimmed">
                                Accepted formats: .r, .rmd, .py, .ipynb.
                            </Text>
                        </Grid.Col>
                    </Grid>
                </Group>

                <Group grow justify="center" align="center" mt="md">
                    <Grid>
                        <Grid.Col span={titleSpan}>
                            <FormFieldLabel
                                label="Additional file(s)"
                                variant="optional"
                                inputId="additionalCodeFiles"
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 6, md: 4 }}>
                            <Dropzone
                                name="additionalCodeFiles"
                                onDrop={(files) => {
                                    handleDuplicateUpload(mainCodeFile, files)

                                    const filteredFiles = mainCodeFile
                                        ? files.filter((f) => f.name !== mainCodeFile.name)
                                        : files

                                    const newAdditionalFiles = uniqueBy(
                                        [...filteredFiles, ...additionalCodeFiles],
                                        (file) => file.name,
                                    )
                                    setAdditionalCodeFiles(newAdditionalFiles)
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
                            >
                                <Stack align="center" justify="center" gap="md" style={{ pointerEvents: 'none' }}>
                                    <Text fz="sm" c="dimmed">
                                        Upload File
                                    </Text>
                                    <Dropzone.Accept>
                                        <UploadIcon />
                                    </Dropzone.Accept>
                                    <Dropzone.Reject>
                                        <XIcon />
                                    </Dropzone.Reject>
                                    <Dropzone.Idle>
                                        <UploadSimpleIcon />
                                    </Dropzone.Idle>
                                    <Group gap="xs">
                                        <Text size="sm" c="dimmed">
                                            Drop your files or
                                        </Text>
                                        <Text td="underline" c="dimmed" fz="sm">
                                            Browse
                                        </Text>
                                    </Group>
                                    <Text size="xs" c="dimmed">
                                        {ACCEPTED_FILE_FORMATS_TEXT}
                                    </Text>
                                </Stack>
                            </Dropzone>
                        </Grid.Col>
                        <Grid.Col span={{ base: 4, md: 6 }}>
                            <Divider orientation="vertical" />
                            {additionalCodeFiles.map((file) => (
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
                        </Grid.Col>
                        {studyUploadForm.errors['totalFileSize'] && (
                            <Grid.Col>
                                <InputError error={studyUploadForm.errors['totalFileSize']} />
                            </Grid.Col>
                        )}
                    </Grid>
                </Group>

                <Group justify="flex-end" mt="xl">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={handleDone}>Done</Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
