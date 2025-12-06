import { Language } from '@/database/types'
import { getAcceptedFormatsForLanguage, languageLabels } from '@/lib/languages'
import { Box, Button, Divider, Group, MantineTheme, Paper, Stack, Text, Title, UnstyledButton } from '@mantine/core'
import { ArrowSquareOutIcon, FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import { FC } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { UseFormReturnType } from '@mantine/form'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'

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
    // studyUploadForm,
    showStepIndicator = false,
    title = 'Study code',
    language,
    orgSlug,
}: StudyCodeUploadProps) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    // const theme = useMantineTheme()
    // const color = theme.colors.blue[7]

    // const removeAdditionalFiles = (fileToRemove: File) => {
    //     const updatedAdditionalFiles = studyProposalForm
    //         .getValues()
    //         .additionalCodeFiles.filter((file) => file.name !== fileToRemove.name)
    //     studyProposalForm.setFieldValue('additionalCodeFiles', updatedAdditionalFiles)
    //     studyProposalForm.validateField('totalFileSize')
    // }
    // const { getFileUploadIcon } = useFileUploadIcons()

    // const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    // const mainFileUpload = getFileUploadIcon(color, studyProposalForm.values.mainCodeFile?.name ?? '')

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
            <Text mb="xl">Include the code files you wish to run on the Data Organization&apos;s dataset.</Text>

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
            />

            {/* TODO: Refactor below uploader for usage in the modal */}

            {/* <Group grow justify="center" align="center">
                <Grid>
                    <Grid.Col span={titleSpan}>
                        <Group gap="xs">
                            <FormFieldLabel label="Main code file" inputId={studyProposalForm.key('mainCodeFile')} />
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
                            value={studyProposalForm.values.mainCodeFile}
                            onChange={(file) => {
                                const { additionalCodeFiles } = studyProposalForm.getValues()
                                const isDuplicate = handleDuplicateUpload(file, additionalCodeFiles)

                                if (isDuplicate) {
                                    studyProposalForm.setFieldValue('mainCodeFile', null)
                                    return
                                }

                                studyProposalForm.setFieldValue('mainCodeFile', file)
                                studyProposalForm.validateField('totalFileSize')
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
                            inputId={studyProposalForm.key('additionalCodeFiles')}
                        />
                    </Grid.Col>
                    <GridCol span={{ base: 6, md: 4 }}>
                        <Dropzone
                            name="additionalCodeFiles"
                            onDrop={(files) => {
                                const { additionalCodeFiles: previousFiles, mainCodeFile } =
                                    studyProposalForm.getValues()

                                handleDuplicateUpload(mainCodeFile, files)

                                const filteredFiles = mainCodeFile
                                    ? files.filter((f) => f.name !== mainCodeFile.name)
                                    : files

                                const additionalFiles = uniqueBy(
                                    [...filteredFiles, ...previousFiles],
                                    (file) => file.name,
                                )
                                studyProposalForm.setFieldValue('additionalCodeFiles', additionalFiles)
                                studyProposalForm.validateField('totalFileSize')
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
                    </GridCol>
                    <GridCol span={{ base: 4, md: 6 }}>
                        <Divider orientation="vertical" />
                        {studyProposalForm.getValues().additionalCodeFiles.map((file) => (
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
                    {studyProposalForm.errors['totalFileSize'] && (
                        <GridCol>
                            <InputError error={studyProposalForm.errors['totalFileSize']} />
                        </GridCol>
                    )}
                </Grid>
            </Group> */}
        </Paper>
    )
}

const StudyCodeUploadModal: FC<{
    onClose: () => void
    isOpen: boolean
    onConfirmAndClose: () => void
}> = ({ onClose, isOpen, onConfirmAndClose }) => {
    return (
        <AppModal isOpen={isOpen} onClose={onClose} title="Upload your code files">
            <Stack>
                <Text size="md">Todo: Add dropzone uploader logic here</Text>

                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirmAndClose}>Done</Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
