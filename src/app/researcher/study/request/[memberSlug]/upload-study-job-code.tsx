'use client'
import { FC, useState } from 'react'
import { Divider, Group, Paper, Stack, Text, Title, Grid, GridCol, useMantineTheme } from '@mantine/core'
import { CheckCircle, Upload, UploadSimple, X as PhosphorX, Trash } from '@phosphor-icons/react/dist/ssr'
import { Dropzone, FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

// TODO use me in other file
export const UploadStudyJobCode: FC<{ studyProposalForm: UseFormReturnType<StudyProposalFormValues> }> = ({
    studyProposalForm,
}) => {
    const theme = useMantineTheme()
    const [files, setFiles] = useState<FileWithPath[]>([])

    const removeFile = (fileToRemove: FileWithPath) => {
        const updatedFiles = files.filter((file) => file.name !== fileToRemove.name)
        setFiles(updatedFiles)
        studyProposalForm.setFieldValue('codeFiles', updatedFiles)
    }

    return (
        <Paper pt="sm" pl="xl" pr="lg" pb="md">
            <Title order={4} pr="lg" pb="sm">
                Study Code
            </Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="md">
                This section is key to your proposal, as it defines the analysis that will generate the results
                you&apos;re intending to obtain from the organization&apos;s data.{' '}
                <strong>Important Requirements:</strong> In this iteration, we currently support <strong>.R</strong> or{' '}
                <strong>.Rmd</strong> formats. One file must be named <strong>main.r</strong> or else execution will
                fail.
            </Text>

            <Grid>
                <GridCol span={4}>
                    <Dropzone
                        name="codeFiles"
                        onDrop={(files) => {
                            setFiles((previousFiles) => uniqueBy([...previousFiles, ...files], (file) => file.name))
                            studyProposalForm.setFieldValue('codeFiles', files)
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
                        accept={{
                            'application/x-r': ['.r', '.R'],
                            'text/x-r': ['.r', '.R'],
                            'text/markdown': ['.rmd'],
                        }}
                    >
                        <Stack align="center" justify="center" gap="md" style={{ pointerEvents: 'none' }}>
                            <Text fw="bold">Upload File</Text>
                            <Dropzone.Accept>
                                <Upload />
                            </Dropzone.Accept>
                            <Dropzone.Reject>
                                <PhosphorX />
                            </Dropzone.Reject>
                            <Dropzone.Idle>
                                <UploadSimple />
                            </Dropzone.Idle>
                            <Group gap="xs">
                                <Text size="md">Drop your files or</Text>
                                <Text td="underline" c="purple.5" fw="bold">
                                    Browse
                                </Text>
                            </Group>
                            <Text size="xs" c="dimmed">
                                .R and .Rmd only
                            </Text>
                        </Stack>
                    </Dropzone>
                </GridCol>
                <GridCol span={6}>
                    <Divider orientation="vertical" />
                    {files.map((file) => (
                        <Group key={file.name} gap="md" w="100%">
                            <Group>
                                <CheckCircle weight="fill" color="#2F9844" />
                                <Text>{file.name}</Text>
                            </Group>
                            <Trash
                                onClick={() => removeFile(file)}
                                style={{ cursor: 'pointer' }}
                                color={theme.colors.grey[2]}
                                weight="bold"
                            />
                        </Group>
                    ))}
                    {studyProposalForm.errors.codeFiles && <Text c="red">{studyProposalForm.errors.codeFiles}</Text>}
                </GridCol>
            </Grid>
        </Paper>
    )
}
