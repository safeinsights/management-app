'use client'

import { useQuery, useState } from '@/common'
import { LegalDocumentContent } from '@/components/legal/document-content'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert } from '@/components/errors'
import { LegalDocumentType } from '@/database/types'
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { createLegalDocumentDraftAction } from '@/server/actions/legal-document.actions'
import { Paper, Title, Button, Flex, Group, Text, Stack, ActionIcon } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { ReadOnlyField } from './read-only-field'

export function PreviewDocument({ url, label }: { url: string; label: string }) {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['contents', url],
        queryFn: async () => {
            const res = await fetch(url)
            if (!res.ok) throw new Error(`Failed to load document ${res.status}`)
            return res.text()
        },
    })

    if (isLoading) return <LoadingMessage message="Loading..." />
    if (isError || !data) return <ErrorAlert error={error ?? 'The document could not be loaded'} color="red" />
    return <LegalDocumentContent content={data} label={label} />
}

// The four modal pages:

export function DraftForm({
    doctype,
    draftName,
    onDraftSaved,
}: {
    doctype: LegalDocumentType
    draftName: string | null
    onDraftSaved: () => void
}) {
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
                <Stack pt="sm">
                    {draftName && <ReadOnlyField label="Current saved draft:" value={draftName}></ReadOnlyField>}
                    {file && (
                        <Group justify="space-between" align="center">
                            <ReadOnlyField label="Uploaded:" value={file.name} />
                            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                                <TrashIcon size={16} />
                            </ActionIcon>
                        </Group>
                    )}
                </Stack>
            </Paper>
            <Flex align="right" justify="right">
                <Button onClick={saveDraft} disabled={!file} ml="xs" rightSection={<ArrowCircleRightIcon size={16} />}>
                    Save Draft
                </Button>
            </Flex>
        </Stack>
    )
}

export function ReviewPrePublishForm({
    doctype,
    draftUrl,
    onBack,
    onConfirm,
}: {
    doctype: LegalDocumentType
    draftUrl: string
    onBack: () => void
    onConfirm: () => void
}) {
    return (
        <Stack>
            <Title order={4} pb="sm">
                Review your saved draft:
            </Title>
            <PreviewDocument url={draftUrl} label={legalDocumentTypeLabels[doctype]} />
            <Group pt="md">
                <Button variant="outline" onClick={onBack}>
                    Back
                </Button>
                <Button onClick={onConfirm}>Publish</Button>
            </Group>
        </Stack>
    )
}

export function ConfirmPublishForm({
    draftName,
    onPublish,
    onBack,
}: {
    draftName: string
    onPublish: () => void
    onBack: () => void
}) {
    return (
        <Stack>
            <Title order={4} pb="sm">
                Publish this file?
            </Title>
            <ReadOnlyField label="File" value={draftName} />
            <Text>
                Publishing will trigger an acknowledgment popup for every user, blocking them from logging in. This
                cannot be undone.
            </Text>
            <Group pt="md">
                <Button variant="outline" onClick={onBack}>
                    Back
                </Button>
                <Button onClick={onPublish}>Confirm</Button>
            </Group>
        </Stack>
    )
}

// todo: tests
