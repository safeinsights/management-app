import { Language } from '@/database/types'
import { useWorkspaceLauncher } from '@/hooks/use-workspace-launcher'
import { Alert, Button, Divider, Group, Paper, useMantineTheme, Stack, Text, Title } from '@mantine/core'
import { FC, useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { AppModal } from './modal'
import { OPENSTAX_ORG_SLUG } from '@/lib/constants'
import { UseFormReturnType } from '@mantine/form'
import { StudyJobCodeFilesValues } from '@/schema/study-proposal'
import { LightbulbIcon } from '@phosphor-icons/react'
import { LaunchIDEButton, OrDivider, UploadFilesButton } from './study/study-upload-buttons'

interface StudyCodeUploadProps {
    studyUploadForm: UseFormReturnType<StudyJobCodeFilesValues>
    showStepIndicator?: boolean
    title?: string
    language: Language
    orgSlug: string
    studyId?: string | null
    onBeforeLaunchIDE?: () => Promise<string | null> // Returns studyId after saving draft, or null if failed
    onIDELaunched?: () => void // Called when IDE is successfully launched
}

export const StudyCodeUpload = ({
    // studyUploadForm,
    showStepIndicator = false,
    title = 'Study code',
    language,
    orgSlug,
    studyId,
    onBeforeLaunchIDE,
    onIDELaunched,
}: StudyCodeUploadProps) => {
    const [isModalOpen, { open: openModal, close: closeModal }] = useDisclosure(false)
    const [isAlertVisible, setIsAlertVisible] = useState(true)
    const [effectiveStudyId, setEffectiveStudyId] = useState<string | null>(studyId ?? null)
    const theme = useMantineTheme()

    const {
        launchWorkspace,
        isLoading: isLaunchingWorkspace,
        isPending: isWorkspacePending,
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
    const isIDELoading = isLaunchingWorkspace || isWorkspacePending

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
                        <LaunchIDEButton
                            onClick={handleLaunchIDE}
                            language={language}
                            loading={isIDELoading}
                            error={!!launchError}
                        />
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
