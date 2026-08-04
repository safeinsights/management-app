'use client'

import { useState } from '@/common'
import { LegalDocumentType } from '@/database/types'
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'
import { createLegalDocumentDraftAction } from '@/server/actions/legal-document.actions'
import { Paper, Title, Button, Flex, Group, Text, Stack } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon } from '@phosphor-icons/react/dist/ssr'

// Access modal from "Upload New {label}" button
// Page 1: upload draft. Displays if there isn't a current draft
// Page 2: Shows after finishing Page 1 ("Save Draft" button), or if there is a current draft
// and contains review + publish logic

export default function DraftForm({ doctype }: { doctype: LegalDocumentType }) {
    const [file, setFile] = useState<File | null>(null)

    const handleDrop = (files: File[]) => {
        // Expects that there is one file and its type is .md
        const draftFile = files[0]
        setFile(draftFile)
    }
    const saveDraft = async () => {
        if (!file) return
        // Call Chris's save draft action
        const result = await createLegalDocumentDraftAction({ type: doctype, fileName: file.name })
        if (isActionError(result)) {
            throw new Error('Failed to create draft: ' + result)
        }
        // params: { type, orgId, studyId, fileName, format }
        // Upload file to S3
        await uploadFiles([[file, result.upload]])
    }
    return (
        <Stack>
            <Title order={4} pb="sm">
                Upload your draft document here:
            </Title>
            <Paper shadow="xs" p="md">
                <Dropzone onDrop={handleDrop} p="md">
                    <Group gap="xs" justify="center">
                        <Dropzone.Accept>
                            <UploadIcon size={24} />
                        </Dropzone.Accept>
                        <Dropzone.Idle>
                            <FileArrowUpIcon size={24} />
                        </Dropzone.Idle>
                        <Text size="sm" c="dimmed">
                            Drop files or click to browse
                        </Text>
                    </Group>
                </Dropzone>
                {file && <Text pt="sm">Uploaded: {file.name}</Text>}
            </Paper>
            <Flex align="right" justify="right">
                <Button onClick={saveDraft} ml="xs" rightSection={<ArrowCircleRightIcon size={16} />}>
                    Save Draft
                </Button>
            </Flex>
        </Stack>
    )
}
