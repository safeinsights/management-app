'use client'
import { FC, useState } from 'react'
import { Divider, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { CheckCircle, Upload, UploadSimple, X as PhosphorX } from '@phosphor-icons/react/dist/ssr'
import { Dropzone, FileWithPath } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { uniqueBy } from 'remeda'
import { UseFormReturnType } from '@mantine/form'
import { StudyProposalFormValues } from '@/app/researcher/study/request/[memberIdentifier]/study-proposal-schema'

// TODO use me in other file
export const UploadStudyJobCode: FC<{ studyProposalForm: UseFormReturnType<StudyProposalFormValues> }> = ({
    studyProposalForm,
}) => {
    const [files, setFiles] = useState<FileWithPath[]>([])

    return (
        <Paper p="md">
            <Title order={4}>Study Code</Title>
            <Divider my="sm" mt="sm" mb="md" />
            <Text mb="md">
                This section is key to your proposal, as it defines the analysis that will generate the results
                you&apos;re intending to obtain from the Member&apos;s data. Upload any necessary files to support your
                analysis. In this iteration, we currently support .r and .rmd files.
            </Text>

            <Group justify="space-evenly" gap="xl">
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
                        'text/plain': ['.r', '.R', '.rmd'],
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
                        <Text size="md">Drop your files or browse</Text>
                        <Group>
                            <Text size="xs" c="dimmed">
                                .R, .r, .rmd only
                            </Text>
                        </Group>
                    </Stack>
                </Dropzone>
                <Divider orientation="vertical" />
                <Stack>
                    {files.map((file) => (
                        <Group key={file.name}>
                            <CheckCircle weight="fill" color="#2F9844" />
                            <Text>{file.name}</Text>
                        </Group>
                    ))}
                </Stack>
            </Group>
            {studyProposalForm.errors.codeFiles && <Text c="red">{studyProposalForm.errors.codeFiles}</Text>}
        </Paper>
    )
}
