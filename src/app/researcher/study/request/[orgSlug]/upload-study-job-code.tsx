'use client'
import { FC } from 'react'
import { Divider, Group, Paper, Stack, Text, Title, Grid, GridCol, useMantineTheme, FileInput } from '@mantine/core'
import {
    CheckCircleIcon,
    UploadIcon,
    UploadSimpleIcon,
    XIcon,
    XCircleIcon,
    FileDocIcon,
    FilePdfIcon,
    FileTextIcon,
    AsteriskIcon,
} from '@phosphor-icons/react/dist/ssr'
import { Dropzone, FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'
import { FormFieldLabel } from '@/components/form-field-label'
import { ACCEPTED_FILE_TYPES, ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'
import { InputError } from '@/components/errors'

// Detects if any uploaded files share the same name as the main code file and shows a notification.
export const handleDuplicateUpload = (mainFile: File | null, additionalFiles: FileWithPath[] | null): boolean => {
    if (!mainFile || !additionalFiles) return false

    const duplicateFound = additionalFiles.some((file) => file.name === mainFile.name)

    if (duplicateFound) {
        notifications.show({
            color: 'red',
            title: 'Duplicate filename',
            message: `The file name "${mainFile.name}" has already been uploaded. Please choose a different file name or remove the existing one before continuing.`,
        })
    }

    return duplicateFound
}

export const UploadStudyJobCode: FC<{ studyProposalForm: UseFormReturnType<StudyProposalFormValues> }> = ({
    studyProposalForm,
}) => {
    const theme = useMantineTheme()
    const color = theme.colors.blue[7]

    const removeAdditionalFiles = (fileToRemove: FileWithPath) => {
        const updatedAdditionalFiles = studyProposalForm
            .getValues()
            .additionalCodeFiles.filter((file) => file.name !== fileToRemove.name)
        studyProposalForm.setFieldValue('additionalCodeFiles', updatedAdditionalFiles)
        studyProposalForm.validateField('totalFileSize')
    }

    const titleSpan = { base: 12, sm: 4, lg: 2 }
    const inputSpan = { base: 12, sm: 8, lg: 4 }

    const getFileUploadIcon = (color: string, fileName?: string | null) => {
        if (!fileName) return <UploadSimpleIcon size={14} color={theme.colors.purple[5]} weight="fill" />
        const Icons: [RegExp, React.ReactNode][] = [
            [/\.docx?$/i, <FileDocIcon key="doc" size={14} color={color} />],
            [/\.txt$/i, <FileTextIcon key="txt" size={14} color={color} />],
            [/\.pdf$/i, <FilePdfIcon key="pdf" size={14} color={color} />],
        ]
        const matchedIcon = Icons.find(([re]) => re.test(fileName))?.[1]
        return matchedIcon || <UploadSimpleIcon size={14} color={color} weight="fill" />
    }

    const mainFileUpload = getFileUploadIcon(color, studyProposalForm.values.mainCodeFile?.name ?? '')

    return (
        <Paper p="xl">
            <Text fz="sm" fw={700} c="gray.6" pb="sm">
                Step 2 of 2
            </Text>
            <Title order={4}>Study Code</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="md">
                Upload the code you intend to run on the data organization&apos;s dataset. This is a critical step in
                your proposal, as it defines the analysis that will produce the results you aim to obtain from the
                organization&apos;s data.
            </Text>
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

                                // Show duplicate error and upload all files without duplicate filenames
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
                                <XCircleIcon
                                    onClick={() => removeAdditionalFiles(file)}
                                    style={{ cursor: 'pointer' }}
                                    color={theme.colors.grey[2]}
                                    weight="bold"
                                />
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
