import { FC, useState } from 'react'
import { Paper, Title, Text, Divider, Table, Radio, ActionIcon, Stack, Group, Button } from '@mantine/core'
import { TrashIcon } from '@phosphor-icons/react'

interface ReviewUploadedFilesProps {
    files: File[]
    setFiles: (files: File[]) => void
    onBack: () => void
    onSaveAndProceed: (mainFileName: string) => void
    orgSlug: string
    studyId: string
    isSaving?: boolean
}

export const ReviewUploadedFiles: FC<ReviewUploadedFilesProps> = ({
    files,
    setFiles,
    onBack,
    onSaveAndProceed,
    isSaving = false,
}) => {
    const [mainFile, setMainFile] = useState<string | null>(files.length > 0 ? files[0].name : null)

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
            setMainFile(newFiles.length > 0 ? newFiles[0].name : null)
        }
    }

    const handleSaveAndProceed = () => {
        if (mainFile) {
            onSaveAndProceed(mainFile)
        }
    }

    const rows = files.map((file) => (
        <Table.Tr key={file.name}>
            <Table.Td>
                <Radio
                    name="mainFile"
                    value={file.name}
                    checked={mainFile === file.name}
                    onChange={(event) => setMainFile(event.currentTarget.value)}
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

                <Group justify="flex-end" mt="md">
                    <Button variant="outline" onClick={onBack}>
                        Back
                    </Button>
                    <Button
                        onClick={handleSaveAndProceed}
                        disabled={!mainFile || files.length === 0}
                        loading={isSaving}
                    >
                        Save and proceed to review
                    </Button>
                </Group>
            </Stack>
        </Paper>
    )
}
