import { Language } from '@/database/types'
import { getAcceptedFormatsForLanguage, languageLabels } from '@/lib/languages'
import { InputError } from '@/components/errors'
import { handleDuplicateUpload } from '@/hooks/file-upload'
import { ACCEPTED_FILE_TYPES } from '@/lib/types'
import {
    ActionIcon,
    Alert,
    Box,
    Button,
    Divider,
    Grid,
    GridCol,
    Group,
    MantineTheme,
    Paper,
    useMantineTheme,
    Stack,
    Text,
    Title,
    UnstyledButton,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import {
    ArrowSquareOutIcon,
    FileArrowUpIcon,
    UploadIcon,
    XCircleIcon,
    XIcon,
    CheckCircleIcon,
} from '@phosphor-icons/react/dist/ssr'
import { FC, useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG, PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { UseFormReturnType } from '@mantine/form'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import { LightbulbIcon } from '@phosphor-icons/react'
import { uniqueBy } from 'remeda'
//import { fetchStarterCodeAction } from '@/app/[orgSlug]/admin/settings/base-images.actions'

interface StudyCodeUploadProps {
    studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues>
    showStepIndicator?: boolean
    title?: string
    language: Language
    orgSlug: string
}

// Shared button box styles
const buttonBoxStyles = (theme: MantineTheme) => ({
    border: `1px solid ${theme.colors.charcoal[1]}`,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.xxl,
    boxShadow: theme.shadows.md,
    cursor: 'pointer',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
})

// Upload Files Button Component
const UploadFilesButton: FC<{ onClick: () => void; language: Language }> = ({ onClick, language }) => (
    <UnstyledButton onClick={onClick} style={{ width: 320, height: 200 }}>
        <Box style={(theme) => buttonBoxStyles(theme)}>
            <Stack align="center" justify="center" gap={4}>
                <FileArrowUpIcon size={20} />
                <Text fw={600} fz="sm">
                    Upload your files
                </Text>
                <Text fz="xs" c="gray.6">
                    {getAcceptedFormatsForLanguage(language)}
                </Text>
            </Stack>
        </Box>
    </UnstyledButton>
)

// Launch IDE Button Component
const LaunchIDEButton: FC<{ onClick: () => void; language: Language }> = ({ onClick, language }) => (
    <UnstyledButton onClick={onClick} style={{ width: 320, height: 200 }}>
        <Box style={(theme) => buttonBoxStyles(theme)}>
            <Stack align="center" justify="center" gap={4}>
                <ArrowSquareOutIcon size={20} />
                <Text fw={600} fz="sm">
                    Launch IDE
                </Text>
                <Text fz="xs" c="gray.6">
                    Supported programming language: {languageLabels[language]}
                </Text>
            </Stack>
        </Box>
    </UnstyledButton>
)

// OR Divider Component
const OrDivider: FC = () => (
    <Group gap="xs" px="md">
        <Divider style={{ width: 20 }} c="charcoal.1" />
        <Text fz="sm" fw={700}>
            OR
        </Text>
        <Divider style={{ width: 20 }} c="charcoal.1" />
    </Group>
)

export const StudyCodeUpload = ({
    showStepIndicator = false,
    title = 'Study code',
    language,
    orgSlug,
    studyUploadForm,
}: StudyCodeUploadProps) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useState(true)
    const theme = useMantineTheme()

    const handleConfirmAndProceed = () => {
        // TODO: Implement logic to proceed with the study code upload
        closeModal()
    }

    const handleLaunchIDE = () => {
        // TODO: Implement logic to launch the IDE
    }

    const isOpenstaxOrg = orgSlug === OPENSTAX_ORG_SLUG

    return (
        <Paper p="xl">
            {showStepIndicator && (
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 4 of 4
                </Text>
            )}
            <Title order={4}>{title}</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="xl">
                Include the code files you wish to run on the Data Organization&apos;s dataset.{' '}
                {isOpenstaxOrg && (
                    <>
                        You can either upload your own files or write them in our{' '}
                        <Text component="span" fw={600}>
                            Integrated Development Environment (IDE).
                        </Text>
                        {isAlertVisible && (
                            <Alert
                                icon={<LightbulbIcon weight="fill" color={theme.colors.green[9]} />}
                                title="Helpful tip"
                                color="green"
                                withCloseButton
                                onClose={() => setIsAlertVisible(false)}
                                mt="md"
                                mb="xxl"
                                styles={{
                                    body: { gap: 8 },
                                    title: { color: theme.colors.green[9] },
                                    closeButton: { color: theme.colors.green[9] },
                                }}
                            >
                                IDE is pre-configured to help you write your code and test it against sample data.
                            </Alert>
                        )}
                    </>
                )}
            </Text>

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
                    <Text size="sm">
                        Upload your code file(s). Important: Make sure that your main file includes the &nbsp;
                    </Text>
                    <Text size="sm" c="blue.7" fw="bold">
                        Starter Code
                    </Text>
                    <ArrowSquareOutIcon size={14} weight="bold" color={theme.colors.blue[7]} />
                    <Text size="sm">provided by the data organization.</Text>
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
