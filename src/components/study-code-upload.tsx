import { StudyJobCodeFilesValues } from '@/app/researcher/study/request/[orgSlug]/study-proposal-form-schema'
import { handleDuplicateUpload, useFileUploadIcons } from '@/app/researcher/utils/file-upload'
import { InputError } from '@/components/errors'
import { FormFieldLabel } from '@/components/form-field-label'
import { PROPOSAL_GRID_SPAN } from '@/lib/constants'
import { ACCEPTED_FILE_FORMATS_TEXT, ACCEPTED_FILE_TYPES } from '@/lib/types'
import {
    ActionIcon,
    Divider,
    FileInput,
    Grid,
    GridCol,
    Group,
    Paper,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { UseFormReturnType } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import {
    AsteriskIcon,
    CheckCircleIcon,
    UploadIcon,
    UploadSimpleIcon,
    XCircleIcon,
    XIcon,
} from '@phosphor-icons/react/dist/ssr'
import { uniqueBy } from 'remeda'

interface StudyCodeUploadProps {
    studyProposalForm: UseFormReturnType<StudyJobCodeFilesValues>
    showStepIndicator?: boolean
    title?: string
}

export const StudyCodeUpload = ({
    studyProposalForm,
    showStepIndicator = false,
    title = 'Study Code',
}: StudyCodeUploadProps) => {
    const theme = useMantineTheme()
    const color = theme.colors.blue[7]

    const removeAdditionalFiles = (fileToRemove: File) => {
        const updatedAdditionalFiles = studyProposalForm
            .getValues()
            .additionalCodeFiles.filter((file) => file.name !== fileToRemove.name)
        studyProposalForm.setFieldValue('additionalCodeFiles', updatedAdditionalFiles)
        studyProposalForm.validateField('totalFileSize')
    }
    const { getFileUploadIcon } = useFileUploadIcons()

    const { titleSpan, inputSpan } = PROPOSAL_GRID_SPAN

    const mainFileUpload = getFileUploadIcon(color, studyProposalForm.values.mainCodeFile?.name ?? '')

    return (
        <Paper p="xl">
            {showStepIndicator && (
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 3 of 3
                </Text>
            )}
            <Title order={4}>{title}</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="md">Upload the code you intend to run on the data organization&apos;s dataset. </Text>
            <Group grow justify="center" align="center" mt="md">
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
                            accept={'.r,.R'}
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
                            Accepted formats: one .r file only.
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
                                                `${rej.file.name} ${rej.errors.map((err) => `${err.code}: ${err.message}`).join(', ')}`,
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
            </Group>
        </Paper>
    )
}
