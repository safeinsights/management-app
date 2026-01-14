'use client'

import { ActionIcon, Button, Divider, Group, Paper, Radio, Stack, Table, Text, Title } from '@mantine/core'
import { TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { useResubmitCode } from '@/contexts/resubmit-code'

export function ReviewUploadedFiles() {
    const {
        studyId,
        submittingOrgSlug,
        uploadedFiles,
        uploadMainFile,
        uploadLastModified,
        canSubmitUpload,
        isPending,
        goToUpload,
        setUploadMainFile,
        removeUploadedFile,
        resubmitStudy,
    } = useResubmitCode()

    return (
        <Paper p="xl">
            <Stack gap="md">
                <div>
                    <Title order={4}>Review uploaded files</Title>
                    {uploadLastModified && (
                        <Text size="sm" c="dimmed">
                            Last updated on {uploadLastModified}
                        </Text>
                    )}
                </div>

                <Divider />

                <Text size="sm">
                    If you&apos;re uploading multiple files, please select your main file (i.e., the script that runs
                    first)
                </Text>

                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Main file</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th>Delete</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {uploadedFiles.map((file) => (
                            <Table.Tr key={file.name}>
                                <Table.Td>
                                    <Radio
                                        name="mainFile"
                                        value={file.name}
                                        checked={uploadMainFile === file.name}
                                        onChange={(event) => setUploadMainFile(event.currentTarget.value)}
                                    />
                                </Table.Td>
                                <Table.Td>{file.name}</Table.Td>
                                <Table.Td>
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        onClick={() => removeUploadedFile(file.name)}
                                    >
                                        <TrashIcon />
                                    </ActionIcon>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={goToUpload}>
                        Back
                    </Button>
                    <ResubmitCancelButton
                        isDirty={uploadedFiles.length > 0}
                        disabled={isPending}
                        href={Routes.studyView({ orgSlug: submittingOrgSlug, studyId })}
                    />
                    <Button onClick={resubmitStudy} disabled={!canSubmitUpload} loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </Paper>
    )
}
