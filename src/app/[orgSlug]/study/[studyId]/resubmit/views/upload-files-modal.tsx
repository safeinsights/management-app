'use client'

import React from 'react'
import {
    ActionIcon,
    Button,
    Divider,
    Grid,
    GridCol,
    Group,
    Radio,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { FileArrowUpIcon, UploadIcon, XCircleIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import { uniqueBy } from 'remeda'
import { AppModal } from '@/components/modal'
import { ACCEPTED_FILE_TYPES } from '@/lib/types'
import { getAcceptedFormatsForLanguage } from '@/lib/languages'
import { Language } from '@/database/types'

interface UploadFilesModalProps {
    isOpen: boolean
    onClose: () => void
    language: Language
    onConfirmAndProceed: (files: File[], mainFileName: string) => void
}

export function UploadFilesModal({ isOpen, onClose, language, onConfirmAndProceed }: UploadFilesModalProps) {
    const theme = useMantineTheme()
    const [files, setFiles] = React.useState<File[]>([])
    const [selectedMainFile, setSelectedMainFile] = React.useState<string>('')

    const handleDrop = (droppedFiles: File[]) => {
        const newFiles = uniqueBy([...droppedFiles, ...files], (file) => file.name)
        setFiles(newFiles)
        if (!selectedMainFile && newFiles.length > 0) {
            setSelectedMainFile(newFiles[0].name)
        }
    }

    const removeFile = (fileToRemove: File) => {
        const newFiles = files.filter((file) => file.name !== fileToRemove.name)
        setFiles(newFiles)
        if (selectedMainFile === fileToRemove.name) {
            setSelectedMainFile(newFiles.length > 0 ? newFiles[0].name : '')
        }
    }

    const handleDone = () => {
        if (!selectedMainFile || files.length === 0) return
        onConfirmAndProceed(files, selectedMainFile)
    }

    return (
        <AppModal size="xl" isOpen={isOpen} onClose={onClose} title="Upload your code files">
            <Stack>
                <Group gap={0}>
                    <Text size="sm">Upload your code file(s).</Text>
                </Group>
                <Group grow justify="center" align="center" mt="md">
                    <Grid>
                        <GridCol span={{ base: 6, md: 5 }}>
                            <Dropzone
                                name="codeFiles"
                                onDrop={handleDrop}
                                onReject={(rejections) =>
                                    notifications.show({
                                        color: 'red',
                                        title: 'Rejected files',
                                        message: rejections
                                            .map(
                                                (rej) =>
                                                    `${rej.file.name} ${rej.errors
                                                        .map((err) => `${err.code}: ${err.message}`)
                                                        .join(', ')}`,
                                            )
                                            .join('\n'),
                                    })
                                }
                                multiple={true}
                                maxFiles={10}
                                accept={ACCEPTED_FILE_TYPES}
                                p="xl"
                            >
                                <Dropzone.Accept>
                                    <UploadIcon />
                                </Dropzone.Accept>
                                <Dropzone.Reject>
                                    <XIcon />
                                </Dropzone.Reject>
                                <Dropzone.Idle>
                                    <Stack>
                                        <Group gap="xs">
                                            <FileArrowUpIcon size={32} />
                                            <Text size="sm" c="dimmed">
                                                Drop your files or
                                            </Text>
                                            <Text fz="sm" c="purple.6" fw="bold">
                                                Browse
                                            </Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                            {getAcceptedFormatsForLanguage(language)}
                                        </Text>
                                    </Stack>
                                </Dropzone.Idle>
                            </Dropzone>
                        </GridCol>
                        <Divider orientation="vertical" />
                        <GridCol span={{ base: 4, md: 6 }}>
                            <Title order={5}>Uploaded files</Title>
                            <Text size="xs" c="dimmed" mb="sm">
                                Select the main file to run
                            </Text>
                            <Radio.Group value={selectedMainFile} onChange={setSelectedMainFile}>
                                <Stack gap="xs">
                                    {files.map((file) => (
                                        <Group key={file.name} gap="md" w="100%" justify="space-between">
                                            <Group gap="sm">
                                                <Radio value={file.name} label={file.name} />
                                            </Group>
                                            <ActionIcon
                                                variant="transparent"
                                                aria-label={`Remove file ${file.name}`}
                                                onClick={() => removeFile(file)}
                                            >
                                                <XCircleIcon color={theme.colors.grey[2]} weight="bold" />
                                            </ActionIcon>
                                        </Group>
                                    ))}
                                </Stack>
                            </Radio.Group>
                        </GridCol>
                    </Grid>
                </Group>

                <Group>
                    <Button variant="outline" onClick={onClose}>
                        Cancel upload
                    </Button>
                    <Button onClick={handleDone} disabled={!selectedMainFile || files.length === 0}>
                        Done
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
