'use client'
import { FC } from 'react'
import { Divider, Group, Paper, Stack, Text, Title, Grid, GridCol, useMantineTheme } from '@mantine/core'
import {
    CheckCircleIcon,
    UploadIcon,
    UploadSimpleIcon,
    XIcon as PhosphorX,
    TrashIcon,
} from '@phosphor-icons/react/dist/ssr'
import { Dropzone, FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from './study-proposal-form-schema'

export const UploadStudyJobCode: FC<{ studyProposalForm: UseFormReturnType<StudyProposalFormValues> }> = ({
    studyProposalForm,
}) => {
    const theme = useMantineTheme()

    const removeFile = (fileToRemove: FileWithPath) => {
        const updatedFiles = studyProposalForm.getValues().codeFiles.filter((file) => file.name !== fileToRemove.name)
        studyProposalForm.setFieldValue('codeFiles', updatedFiles)
    }

    return (
        <Paper p="xl">
            <Title order={4}>Study Code</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="md">
                This section is key to your proposal, as it defines the analysis that will generate the results
                you&apos;re intending to obtain from the organization&apos;s data.{' '}
                <strong>Important Requirements:</strong> In this iteration, we currently support <strong>.R</strong> or{' '}
                <strong>.Rmd</strong> formats. One file must be named <strong>main.r</strong> or else execution will
                fail.
            </Text>

            <Grid>
                <GridCol span={{ base: 6, md: 4 }}>
                    <Dropzone
                        name="codeFiles"
                        onDrop={(files) => {
                            const { codeFiles: previousFiles } = studyProposalForm.getValues()
                            const updatedFiles = uniqueBy([...files, ...previousFiles], (file) => file.name)
                            studyProposalForm.setFieldValue('codeFiles', updatedFiles)
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
                                <UploadIcon />
                            </Dropzone.Accept>
                            <Dropzone.Reject>
                                <PhosphorX />
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
                                .R and .Rmd only
                            </Text>
                        </Stack>
                    </Dropzone>
                </GridCol>
                <GridCol span={{ base: 4, md: 6 }}>
                    <Divider orientation="vertical" />
                    {studyProposalForm.getValues().codeFiles.map((file) => (
                        <Group key={file.name} gap="md" w="100%">
                            <Group>
                                <CheckCircleIcon weight="fill" color="#2F9844" />
                                <Text>{file.name}</Text>
                            </Group>
                            <TrashIcon
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
