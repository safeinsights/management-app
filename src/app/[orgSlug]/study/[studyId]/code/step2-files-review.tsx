'use client'

import { FC, useState } from 'react'
import {
    ActionIcon,
    Button,
    Group,
    Paper,
    Radio,
    Table,
    Text,
    Title,
    Divider,
    useMantineTheme,
    Stack,
} from '@mantine/core'
import { CaretLeftIcon, TrashIcon, UploadIcon } from '@phosphor-icons/react'
import { useStudyRequestStore, useCodeFiles, FileRef } from '@/stores/study-request.store'

interface CodeFilesReviewProps {
    onBack: () => void
    onProceed: () => void
    isSaving?: boolean
}

const getFileName = (f: FileRef): string => (f.type === 'memory' ? f.file.name : f.name)
const getFileSize = (f: FileRef): number => (f.type === 'memory' ? f.file.size : 0)

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return 'N/A'
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    return `${mb.toFixed(2)} MB`
}

export const CodeFilesReview: FC<CodeFilesReviewProps> = ({ onBack, onProceed, isSaving = false }) => {
    const theme = useMantineTheme()
    const store = useStudyRequestStore()
    const codeFiles = useCodeFiles()

    // Get the current main file name
    const mainFileName = codeFiles.mainFile ? getFileName(codeFiles.mainFile) : ''
    const [selectedMainFile, setSelectedMainFile] = useState(mainFileName)

    // Get all files as a flat array
    const allFiles: FileRef[] = [...(codeFiles.mainFile ? [codeFiles.mainFile] : []), ...codeFiles.additionalFiles]

    const handleRemoveFile = (fileName: string) => {
        store.removeCodeFile(fileName)

        // If we removed the selected main file, select the new main
        if (selectedMainFile === fileName) {
            const remaining = allFiles.filter((f) => getFileName(f) !== fileName)
            if (remaining.length > 0) {
                const newMain = getFileName(remaining[0])
                setSelectedMainFile(newMain)
                store.setMainCodeFile(newMain)
            }
        }
    }

    const handleMainFileChange = (fileName: string) => {
        setSelectedMainFile(fileName)
        store.setMainCodeFile(fileName)
    }

    const handleProceed = () => {
        // Ensure the selected main file is set in the store
        if (selectedMainFile && selectedMainFile !== mainFileName) {
            store.setMainCodeFile(selectedMainFile)
        }
        onProceed()
    }

    return (
        <>
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm">
                    Step 2 of 3
                </Text>
                <Group justify="space-between" align="center" mb="md">
                    <Stack gap={0}>
                        <Title order={4}>Review uploaded files</Title>
                        <Text size="sm" c="dimmed" mt="xs">
                            Last updated: {new Date().toLocaleString()}
                        </Text>
                    </Stack>
                    <Button variant="outline" color="blue" size="sm" onClick={onBack} leftSection={<UploadIcon />}>
                        Upload file(s)
                    </Button>
                </Group>
                <Divider my="sm" mt="sm" mb="md" />
                <Text mb="xl">
                    Review your uploaded files and select the main file to run. You can remove files or go back to
                    upload more.
                </Text>

                <Table w="60%">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Main</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th>Size</Table.Th>
                            <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {allFiles.map((fileRef) => {
                            const fileName = getFileName(fileRef)
                            const fileSize = getFileSize(fileRef)
                            return (
                                <Table.Tr key={fileName}>
                                    <Table.Td>
                                        <Radio
                                            checked={selectedMainFile === fileName}
                                            onChange={() => handleMainFileChange(fileName)}
                                            aria-label={`Select ${fileName} as main file`}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{fileName}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {formatFileSize(fileSize)}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <ActionIcon
                                            variant="transparent"
                                            aria-label={`Remove ${fileName}`}
                                            onClick={() => handleRemoveFile(fileName)}
                                            disabled={allFiles.length === 1}
                                        >
                                            <TrashIcon color={theme.colors.grey[2]} weight="bold" />
                                        </ActionIcon>
                                    </Table.Td>
                                </Table.Tr>
                            )
                        })}
                    </Table.Tbody>
                </Table>

                {allFiles.length === 0 && (
                    <Text c="dimmed" ta="center" py="xl">
                        No files uploaded. Go back to upload files.
                    </Text>
                )}
            </Paper>

            <Group mt="xxl" style={{ width: '100%' }}>
                <Group style={{ marginLeft: 'auto' }}>
                    <Button
                        type="button"
                        size="md"
                        variant="subtle"
                        onClick={onBack}
                        leftSection={<CaretLeftIcon />}
                        disabled={isSaving}
                    >
                        Back to upload
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        size="md"
                        disabled={!selectedMainFile || allFiles.length === 0 || isSaving}
                        loading={isSaving}
                        onClick={handleProceed}
                    >
                        Save and proceed to review
                    </Button>
                </Group>
            </Group>
        </>
    )
}
