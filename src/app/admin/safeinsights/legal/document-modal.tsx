'use client'

import { useQuery, useState } from '@/common'
import { LoadingMessage } from '@/components/loading'
import { ErrorPanel } from '@/components/panel'
import { LegalDocumentType } from '@/database/types'
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'
import { ActionSuccessType } from '@/lib/types'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import {
    createLegalDocumentDraftAction,
    fetchLegalDocumentVersionsAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { Paper, Title, Button, Flex, Group, Text, Stack, Typography, ScrollArea } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon } from '@phosphor-icons/react/dist/ssr'
import Markdown from 'react-markdown'

// Access modal from "Upload New {label}" button
// Page 1: upload draft. Displays if there isn't a current draft
// Page 2: Shows after finishing Page 1 ("Save Draft" button), or if there is a current draft
// and contains review + publish logic

export function DraftForm({ doctype, onDraftSaved }: { doctype: LegalDocumentType; onDraftSaved: () => void }) {
    const [file, setFile] = useState<File | null>(null)

    const handleDrop = (files: File[]) => {
        // Expects that there is one file and its type is .md
        const draftFile = files[0]
        setFile(draftFile)
    }
    const saveDraft = async () => {
        if (!file) return
        // Call Chris's save draft action
        const result = await createLegalDocumentDraftAction({
            type: doctype,
            fileName: file.name,
            format: 'markdown',
        })
        if (isActionError(result)) {
            throw new Error('Failed to create draft: ' + result)
        }
        // result { document, version, upload }
        // Upload file to S3
        await uploadFiles([[file, result.upload]])

        onDraftSaved()
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

type Draft = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['draft']>

export function PreviewDocument({ url }: { url: string }) {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['contents', url],
        queryFn: async () => (await fetch(url)).text(),
    })
    if (isLoading) return <LoadingMessage message="Loading..." />
    if (isError || !data) return <ErrorPanel />
    return (
        <ScrollArea h={400}>
            <Typography>
                <Markdown>{data}</Markdown>
            </Typography>
        </ScrollArea>
    )
}

export function ReviewAndPublishForm({
    doctype,
    draft,
    onPublish,
}: {
    doctype: LegalDocumentType
    draft: Draft
    onPublish: () => void
}) {
    const handleBack = () => {
        // todo: go back to the first page without deleting the draft
    }

    const handlePublish = async () => {
        const result = await publishLegalDocumentVersionAction({ versionId: draft.id })
        if (isActionError(result)) {
            console.log(result.error)
            throw new Error(result.error.toString())
        }
        onPublish()
    }

    return (
        <Stack>
            <Title order={4} pb="sm">
                Review the {legalDocumentTypeLabels[doctype]}
            </Title>
            <PreviewDocument url={draft.downloadUrl} />
            <Flex pt="md">
                <Button variant="outline" mr="sm" onClick={handleBack}>
                    Back
                </Button>
                <Button onClick={handlePublish}>Publish</Button>
            </Flex>
        </Stack>
    )
}
