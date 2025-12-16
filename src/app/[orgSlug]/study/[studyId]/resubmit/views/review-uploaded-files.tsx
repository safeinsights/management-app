'use client'

import { ActionIcon, Button, Divider, Group, Paper, Radio, Stack, Table, Text, Title } from '@mantine/core'
import { TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { Routes } from '@/lib/routes'
import { ResubmitCancelButton } from '@/components/resubmit-cancel-button'
import { useResubmitCodeStore } from '@/stores/resubmit-code.store'

interface ReviewUploadedFilesProps {
    studyId: string
    orgSlug: string
    uploadedFiles: File[]
    uploadMainFile: string | null
    canSubmitUpload: boolean
    isPending: boolean
    onResubmit: () => void
}

export function ReviewUploadedFiles({
    studyId,
    orgSlug,
    uploadedFiles,
    uploadMainFile,
    canSubmitUpload,
    isPending,
    onResubmit,
}: ReviewUploadedFilesProps) {
    const store = useResubmitCodeStore()

    const lastUpdated = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    })

    return (
        <Paper p="xl">
            <Stack gap="md">
                <div>
                    <Title order={4}>Review uploaded files</Title>
                    <Text size="sm" c="dimmed">
                        Last updated on {lastUpdated}
                    </Text>
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
                                        onChange={(event) => store.setUploadMainFile(event.currentTarget.value)}
                                    />
                                </Table.Td>
                                <Table.Td>{file.name}</Table.Td>
                                <Table.Td>
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        onClick={() => store.removeUploadedFile(file.name)}
                                    >
                                        <TrashIcon />
                                    </ActionIcon>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={store.goToUpload}>
                        Back
                    </Button>
                    <ResubmitCancelButton
                        isDirty={uploadedFiles.length > 0}
                        disabled={isPending}
                        href={Routes.studyView({ orgSlug, studyId })}
                    />
                    <Button onClick={onResubmit} disabled={!canSubmitUpload} loading={isPending}>
                        Resubmit study code
                    </Button>
                </Group>
            </Stack>
        </Paper>
    )
}
