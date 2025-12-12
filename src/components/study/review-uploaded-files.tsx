import { FC } from 'react'
import { Paper, Title, Text, Divider, Table, Radio, ActionIcon, Stack } from '@mantine/core'
import { TrashIcon } from '@phosphor-icons/react'

interface ReviewUploadedFilesProps {
    files: File[]
    setFiles: (files: File[]) => void
    onBack: () => void
    orgSlug: string
    studyId: string
    mainFile: string | null
    onMainFileSelect: (fileName: string) => void
}

export const ReviewUploadedFiles: FC<ReviewUploadedFilesProps> = ({ files, setFiles, mainFile, onMainFileSelect }) => {
    const lastUpdated = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
    })

    const handleDelete = (fileToDelete: File) => {
        const newFiles = files.filter((file) => file.name !== fileToDelete.name)
        setFiles(newFiles)
        if (mainFile === fileToDelete.name) {
            onMainFileSelect('')
        }
    }

    const rows = files.map((file) => (
        <Table.Tr key={file.name}>
            <Table.Td>
                <Radio
                    name="mainFile"
                    value={file.name}
                    checked={mainFile === file.name}
                    onChange={(event) => onMainFileSelect(event.currentTarget.value)}
                />
            </Table.Td>
            <Table.Td>{file.name}</Table.Td>
            <Table.Td>
                <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(file)}>
                    <TrashIcon />
                </ActionIcon>
            </Table.Td>
        </Table.Tr>
    ))

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
                    <Table.Tbody>{rows}</Table.Tbody>
                </Table>
            </Stack>
        </Paper>
    )
}
