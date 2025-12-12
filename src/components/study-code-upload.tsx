import { Language } from '@/database/types'
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
import { FC, useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { UseFormReturnType } from '@mantine/form'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import { LightbulbIcon } from '@phosphor-icons/react'
import { uniqueBy } from 'remeda'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from './study/study-upload-buttons'
import { StudyCodeIDE } from './study-code-ide'

/**
 * - 'initial': The initial mode, where the user can upload files or launch the IDE.
 * - 'ide': The IDE mode, where the user can view the IDE and import files from it.
 */
type CodeUploadMode = 'initial' | 'ide'

interface StudyCodeUploadProps {
    studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues>
    showStepIndicator?: boolean
    title?: string
    language: Language
    orgSlug: string
}

export const StudyCodeUpload = ({
    showStepIndicator = false,
    title = 'Study code',
    language,
    orgSlug,
    studyUploadForm,
}: StudyCodeUploadProps) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useState(true)
    const [mode, setMode] = useState<CodeUploadMode>('initial')
    const theme = useMantineTheme()

    const handleConfirmAndProceed = () => {
        // TODO: Implement logic to proceed with the study code upload
        closeModal()
    }

    const handleLaunchIDE = () => {
        setMode('ide')
    }

    const isOpenstaxOrg = orgSlug === OPENSTAX_ORG_SLUG

    const hasCodeFiles = !!(
        studyUploadForm.getValues().mainCodeFile || studyUploadForm.getValues().additionalCodeFiles.length > 0
    )

    // IDE mode view
    if (mode === 'ide') {
        return <StudyCodeIDE showStepIndicator={showStepIndicator} title={title} hasExistingFiles={hasCodeFiles} />
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
                language={language}
            />
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
