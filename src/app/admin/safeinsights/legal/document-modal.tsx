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
import { Paper, Title, Button, Flex, Group, Text, Stack, ActionIcon } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { useDisclosure } from '@mantine/hooks'
import { ReadOnlyField } from './read-only-field'

export function DraftForm({ doctype, onDraftSaved }: { doctype: LegalDocumentType; onDraftSaved: () => void }) {
    const [file, setFile] = useState<File | null>(null)

    const handleDrop = (files: File[]) => {
        // Expects that there is one file and its type is .md
        const draftFile = files[0]
        setFile(draftFile)
    }
    const saveDraft = async () => {
        if (!file) return
        // Call save draft action
        // No format: the action derives it from the type, so a document cannot be stored in a
        // format its viewer cannot render.
        const result = await createLegalDocumentDraftAction({ type: doctype, fileName: file.name })
        if (isActionError(result)) {
            throw new Error('Failed to create draft: ' + result)
        }
        await uploadFiles([[file, result.upload]])

        onDraftSaved()
    }

    const onRemove = () => {
        setFile(null)
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
                <Group pt="sm" justify="space-between" align="center">
                    {file && (
                        <>
                            <Text>Uploaded: {file.name}</Text>
                            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                                <TrashIcon size={16} />
                            </ActionIcon>
                        </>
                    )}
                </Group>
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
    const [confirmPublishOpen, { open: openConfirm, close: closeConfirm }] = useDisclosure(false)
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

    // trim path to get file name; the whole path stands in if it has no separator
    const fileName = draft.filePath.split('/').at(-1) ?? draft.filePath

    if (!confirmPublishOpen) {
        return (
            <Stack>
                <Title order={4} pb="sm">
                    Review your saved draft:
                </Title>
                <PreviewDocument url={draft.downloadUrl} label={legalDocumentTypeLabels[doctype]} />
                <Group pt="md">
                    <Button variant="outline" onClick={handleBack}>
                        Back
                    </Button>
                    <Button onClick={openConfirm}>Publish</Button>
                </Group>
            </Stack>
        )
    } else {
        return (
            <Stack>
                <Title order={4} pb="sm">
                    Publish this file?
                </Title>
                <ReadOnlyField label="File" value={fileName} />
                <Text>
                    Publishing will trigger an acknowledgment popup for every user, blocking them from logging in until
                    they acknowledge. This cannot be undone.
                </Text>
                <Group pt="md">
                    <Button variant="outline" onClick={closeConfirm}>
                        Back
                    </Button>
                    <Button onClick={handlePublish}>Confirm</Button>
                </Group>
            </Stack>
        )
    }
}

// todo: tests
