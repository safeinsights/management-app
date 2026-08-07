'use client'

import type { FC } from '@/common'
import { Group, Paper, Stack, Text } from '@mantine/core'
import { Dropzone, PDF_MIME_TYPE } from '@mantine/dropzone'
import { FileArrowUpIcon, FilePdfIcon, UploadIcon } from '@phosphor-icons/react/dist/ssr'

const ChosenFile: FC<{ file: File | null }> = ({ file }) => {
    if (!file) return null

    return (
        <Group gap="xs" pt="sm">
            <FilePdfIcon size={20} />
            <Text size="sm">{file.name}</Text>
        </Group>
    )
}

// One file only: a version is one document, and the upload URL is signed for a single key.
export const PdfDropzone: FC<{ label: string; file: File | null; onChange: (file: File) => void }> = ({
    label,
    file,
    onChange,
}) => (
    <Stack gap={4}>
        <Text size="sm" fw={500}>
            {label}
        </Text>
        <Paper withBorder>
            <Dropzone onDrop={([dropped]) => onChange(dropped)} accept={PDF_MIME_TYPE} maxFiles={1} p="md">
                <Group gap="xs" justify="center">
                    <Dropzone.Accept>
                        <UploadIcon size={24} />
                    </Dropzone.Accept>
                    <Dropzone.Idle>
                        <FileArrowUpIcon size={24} />
                    </Dropzone.Idle>
                    <Text size="sm" c="dimmed">
                        Choose a PDF to upload, or drag and drop it here
                    </Text>
                </Group>
            </Dropzone>
        </Paper>
        <ChosenFile file={file} />
    </Stack>
)
