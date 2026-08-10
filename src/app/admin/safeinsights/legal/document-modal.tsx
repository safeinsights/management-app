'use client'

import { useQuery, useState } from '@/common'
import { LegalDocumentContent } from '@/components/legal/document-content'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert } from '@/components/errors'
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
import { Paper, Title, Button, Flex, Group, Text, Stack } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon } from '@phosphor-icons/react/dist/ssr'

export function DraftForm({ doctype, onDraftSaved }: { doctype: LegalDocumentType; onDraftSaved: () => void }) {
    const [file, setFile] = useState<File | null>(null)

    const handleDrop = (files: File[]) => {
        // Expects that there is one file and its type is .md
        const draftFile = files[0]
        setFile(draftFile)
    }
    const saveDraft = async () => {
        if (!file) return
        // No format: the action derives it from the type, so a document cannot be stored in a
        // format its viewer cannot render.
        const result = await createLegalDocumentDraftAction({ type: doctype, fileName: file.name })
        if (isActionError(result)) {
            throw new Error('Failed to create draft: ' + result)
        }
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

export type Draft = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['draft']>

export function PreviewDocument({ url, label }: { url: string; label: string }) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['contents', url],
        queryFn: async () => (await fetch(url)).text(),
    })
    if (isLoading) return <LoadingMessage message="Loading..." />
    if (isError || !data) return <ErrorAlert error={error ?? 'The document could not be loaded'} />
    return <LegalDocumentContent content={data} label={label} />
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
            throw new Error(result.error.toString())
        }
        onPublish()
    }

    return (
        <Stack>
            <Title order={4} pb="sm">
                Review the {legalDocumentTypeLabels[doctype]}
            </Title>
            <PreviewDocument url={draft.downloadUrl} label={legalDocumentTypeLabels[doctype]} />
            <Flex pt="md">
                <Button variant="outline" mr="sm" onClick={handleBack}>
                    Back
                </Button>
                <Button onClick={handlePublish}>Publish</Button>
            </Flex>
        </Stack>
    )
}
