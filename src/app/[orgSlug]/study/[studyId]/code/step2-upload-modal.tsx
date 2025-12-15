'use client'

import { FC, useState } from 'react'
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
import { Dropzone, FileRejection } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { FileArrowUpIcon, UploadIcon, XCircleIcon, XIcon } from '@phosphor-icons/react/dist/ssr'
import { uniqueBy } from 'remeda'
import { Language } from '@/database/types'
import { getAcceptedFormatsForLanguage } from '@/lib/languages'
import { ACCEPTED_FILE_TYPES } from '@/lib/types'
import { AppModal } from '@/components/modal'
import { useStudyRequestStore, useCodeFiles, FileRef } from '@/stores/study-request.store'

interface CodeUploadModalProps {
    isOpen: boolean
    onClose: () => void
    language: Language
    onConfirm: () => void
}

const getFileName = (f: FileRef): string => (f.type === 'memory' ? f.file.name : f.name)

export const CodeUploadModal: FC<CodeUploadModalProps> = ({ isOpen, onClose, language, onConfirm }) => {
    const theme = useMantineTheme()
    const [selectedMainFile, setSelectedMainFile] = useState<string>('')

    // Zustand store
    const store = useStudyRequestStore()
    const codeFiles = useCodeFiles()

    // Get all files as a flat array for display
    const allFiles: FileRef[] = [...(codeFiles.mainFile ? [codeFiles.mainFile] : []), ...codeFiles.additionalFiles]

    // Handle file drop
    const handleDrop = (files: File[]) => {
        // Combine with existing files, deduping by name
        const existingFiles = allFiles
            .filter((f): f is { type: 'memory'; file: File } => f.type === 'memory')
            .map((f) => f.file)

        const combinedFiles = uniqueBy([...files, ...existingFiles], (file) => file.name)

        // Determine main file
        const mainFileName = selectedMainFile || combinedFiles[0]?.name || ''
        const mainFile = combinedFiles.find((f) => f.name === mainFileName) || null
        const additionalFiles = combinedFiles.filter((f) => f.name !== mainFileName)

        store.setCodeFiles(mainFile, additionalFiles)

        // Auto-select first file if none selected
        if (!selectedMainFile && combinedFiles.length > 0) {
            setSelectedMainFile(combinedFiles[0].name)
        }
    }

    const handleReject = (rejections: FileRejection[]) => {
        notifications.show({
            color: 'red',
            title: 'Rejected files',
            message: rejections
                .map((rej) => `${rej.file.name} ${rej.errors.map((err) => `${err.code}: ${err.message}`).join(', ')}`)
                .join('\n'),
        })
    }

    const removeFile = (fileName: string) => {
        store.removeCodeFile(fileName)
        if (selectedMainFile === fileName) {
            // Select next available file
            const remaining = allFiles.filter((f) => getFileName(f) !== fileName)
            setSelectedMainFile(remaining.length > 0 ? getFileName(remaining[0]) : '')
        }
    }

    const handleDone = () => {
        if (!selectedMainFile || allFiles.length === 0) return

        // Update the main file selection in store
        store.setMainCodeFile(selectedMainFile)
        onConfirm()
    }

    const handleCancel = () => {
        // Clear files and close
        store.clearCodeFiles()
        setSelectedMainFile('')
        onClose()
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
                                onReject={handleReject}
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
                                    {allFiles.map((fileRef) => {
                                        const fileName = getFileName(fileRef)
                                        return (
                                            <Group key={fileName} gap="md" w="100%" justify="space-between">
                                                <Group gap="sm">
                                                    <Radio value={fileName} label={fileName} />
                                                </Group>
                                                <ActionIcon
                                                    variant="transparent"
                                                    aria-label={`Remove file ${fileName}`}
                                                    onClick={() => removeFile(fileName)}
                                                >
                                                    <XCircleIcon color={theme.colors.grey[2]} weight="bold" />
                                                </ActionIcon>
                                            </Group>
                                        )
                                    })}
                                </Stack>
                            </Radio.Group>
                        </GridCol>
                    </Grid>
                </Group>

                <Group>
                    <Button variant="outline" onClick={handleCancel}>
                        Cancel upload
                    </Button>
                    <Button onClick={handleDone} disabled={!selectedMainFile || allFiles.length === 0}>
                        Done
                    </Button>
                </Group>
            </Stack>
        </AppModal>
    )
}
