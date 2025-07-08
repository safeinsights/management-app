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
} from '@phosphor-icons/react/dist/ssr'
import { Dropzone, FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'
import { FormFieldLabel } from '@/components/form-field-label'
import { ACCEPTED_FILE_TYPES, ACCEPTED_FILE_FORMATS_TEXT } from '@/lib/types'

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
        <>
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 2 of 2
                </Text>
                <Title order={4}>Study Code</Title>
                <Divider my="sm" mt="sm" mb="md" />
                <Text mb="md">
                    Upload the code you intend to run on the data organization&apos;s dataset. This is a critical step
                    in your proposal, as it defines the analysis that will produce the results you aim to obtain from
                    the organization&apos;s data.
                </Text>
                <Group grow justify="center" align="center" mt="md">
                    <Grid>
                        <Grid.Col span={titleSpan}>
                            <FormFieldLabel label="Main code file" inputId={studyProposalForm.key('mainCodeFile')} />
                        </Grid.Col>
                        <Grid.Col span={inputSpan}>
                            <FileInput
                                name="mainCodeFile"
                                leftSection={mainFileUpload}
                                aria-label="Upload Main Code File"
                                placeholder="Upload Main Code File"
                                clearable
                                accept={'.r,.R'}
                                {...studyProposalForm.getInputProps('mainCodeFile')}
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
                                label="Addtional file(s)"
                                inputId={studyProposalForm.key('additionalCodeFiles')}
                            />
                        </Grid.Col>
                        <GridCol span={{ base: 6, md: 4 }}>
                            <Dropzone
                                name="additionalCodeFiles"
                                onDrop={(files) => {
                                    const { additionalCodeFiles: previousFiles } = studyProposalForm.getValues()
                                    const additionalFiles = uniqueBy([...files, ...previousFiles], (file) => file.name)
                                    studyProposalForm.setFieldValue('additionalCodeFiles', additionalFiles)
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
                                    <Text fw="bold">Upload File</Text>
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
                                        <Text size="md">Drop your files or</Text>
                                        <Text td="underline" c="purple.5" fw="bold">
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
                            {studyProposalForm.errors.additionalCodeFiles && (
                                <Text c="red">{studyProposalForm.errors.additionalCodeFiles}</Text>
                            )}
                        </GridCol>
                    </Grid>
                </Group>
            </Paper>
        </>
    )
}
