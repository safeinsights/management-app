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
import { useStudyRequest } from '@/contexts/study-request'
import { getFileName, getFileSize, type FileRef } from '@/contexts/shared/file-types'

interface CodeFilesReviewProps {
    onBack: () => void
    onProceed: () => void
    onOpenUploadModal: () => void
    isSaving?: boolean
}

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return 'N/A'
    const kb = bytes / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB`
    const mb = kb / 1024
    return `${mb.toFixed(2)} MB`
}

interface FileRowProps {
    fileRef: FileRef
    isSelected: boolean
    isOnlyFile: boolean
    onSelect: () => void
    onRemove: () => void
}

const FileRow: FC<FileRowProps> = ({ fileRef, isSelected, isOnlyFile, onSelect, onRemove }) => {
    const theme = useMantineTheme()
    const fileName = getFileName(fileRef)
    const fileSize = getFileSize(fileRef)

    return (
        <Table.Tr>
            <Table.Td>
                <Radio checked={isSelected} onChange={onSelect} aria-label={`Select ${fileName} as main file`} />
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
                    onClick={onRemove}
                    disabled={isOnlyFile}
                >
                    <TrashIcon color={theme.colors.charcoal[4]} weight="fill" />
                </ActionIcon>
            </Table.Td>
        </Table.Tr>
    )
}

export const CodeFilesReview: FC<CodeFilesReviewProps> = ({
    onBack,
    onProceed,
    onOpenUploadModal,
    isSaving = false,
}) => {
    const { codeFiles, codeFilesLastUpdated, removeCodeFile, setMainCodeFile } = useStudyRequest()

    const mainFileName = codeFiles.mainFile ? getFileName(codeFiles.mainFile) : ''
    const [selectedMainFile, setSelectedMainFile] = useState(mainFileName)
    const allFiles: FileRef[] = [...(codeFiles.mainFile ? [codeFiles.mainFile] : []), ...codeFiles.additionalFiles]

    const handleRemoveFile = (fileName: string) => {
        removeCodeFile(fileName)
        if (selectedMainFile === fileName) {
            const remaining = allFiles.filter((f) => getFileName(f) !== fileName)
            if (remaining.length > 0) {
                const newMain = getFileName(remaining[0])
                setSelectedMainFile(newMain)
                setMainCodeFile(newMain)
            }
        }
    }

    const handleMainFileChange = (fileName: string) => {
        setSelectedMainFile(fileName)
        setMainCodeFile(fileName)
    }

    const handleProceed = () => {
        if (selectedMainFile && selectedMainFile !== mainFileName) {
            setMainCodeFile(selectedMainFile)
        }
        onProceed()
    }

    const date = codeFilesLastUpdated?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const time = codeFilesLastUpdated
        ?.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
        .toLowerCase()

    return (
        <>
            <Paper p="xl">
                <Text fz="sm" fw={700} c="gray.6" pb="sm" tt="uppercase">
                    Step 4 of 5
                </Text>
                <Title order={4}>Study code</Title>
                <Divider my="sm" mt="sm" mb="md" />
                <Group justify="space-between" align="center" mb="md">
                    <Stack gap={0}>
                        <Title order={4}>Review uploaded files</Title>
                        {codeFilesLastUpdated && (
                            <Text size="sm" c="dimmed" mt="xs">
                                Last updated on {date} at {time}
                            </Text>
                        )}
                    </Stack>
                    <Button variant="outline" size="sm" onClick={onOpenUploadModal} leftSection={<UploadIcon />}>
                        Upload file(s)
                    </Button>
                </Group>
                <Text mb="xl">
                    If you&apos;re uploading multiple files, please select your main file (i.e., the script that runs
                    first).
                </Text>

                <Table w="60%">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Main file</Table.Th>
                            <Table.Th>File name</Table.Th>
                            <Table.Th>Size</Table.Th>
                            <Table.Th>Delete</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {allFiles.map((fileRef) => (
                            <FileRow
                                key={getFileName(fileRef)}
                                fileRef={fileRef}
                                isSelected={selectedMainFile === getFileName(fileRef)}
                                isOnlyFile={allFiles.length === 1}
                                onSelect={() => handleMainFileChange(getFileName(fileRef))}
                                onRemove={() => handleRemoveFile(getFileName(fileRef))}
                            />
                        ))}
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
