'use client'

import { useMutation, useQuery, useState } from '@/common'
import { LegalDocumentContent } from '@/components/legal/document-content'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert, reportError } from '@/components/errors'
import { LegalDocumentType } from '@/database/types'
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { createLegalDocumentDraftAction } from '@/server/actions/legal-document.actions'
import { Paper, Title, Button, Flex, Group, Text, Stack, ActionIcon } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { ReadOnlyField } from '../read-only-field'

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
        const draftFile = files[0]
        if (draftFile) setFile(draftFile)
    }

    // The dropzone's accept restricts to Markdown; fires when a non-.md or multiple files are dropped.
    const handleReject = () => {
        notifications.show({
            color: 'red',
            title: 'Unsupported file',
            message: 'Please upload a single Markdown (.md) file.',
        })
    }
    // Create the draft row, then upload the bytes. Keeping both inside the mutation means a failure
    // of either — an action error or a rejected S3 upload — lands in onError instead of an unhandled
    // rejection, and isPending drives the button's loading/disabled state.
    // No format: the action derives it from the type, so a document cannot be stored in a format its
    // viewer cannot render.
    const saveDraft = useMutation({
        mutationFn: async (draftFile: File) => {
            const result = await createLegalDocumentDraftAction({ type: doctype, fileName: draftFile.name })
            if (isActionError(result)) return result // wrapped useMutation throws this for onError to catch
            await uploadFiles([[draftFile, result.upload]])
            return result
        },
        onSuccess: () => onDraftSaved(),
        onError: (error: unknown) => reportError(error, 'Could not save draft'),
    })

    const onRemove = () => {
        setFile(null)
    }

    return (
        <Stack>
            <Title order={4} pb="sm">
                Upload your draft document here:
            </Title>
            <Paper shadow="xs" p="md">
                <Dropzone
                    onDrop={handleDrop}
                    onReject={handleReject}
                    accept={{ 'text/markdown': ['.md', '.markdown'] }}
                    maxFiles={1}
                    p="md"
                >
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
                <Button
                    onClick={() => file && saveDraft.mutate(file)}
                    disabled={!file || saveDraft.isPending}
                    loading={saveDraft.isPending}
                    ml="xs"
                    rightSection={<ArrowCircleRightIcon size={16} />}
                >
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
    isPublishing,
}: {
    draftName: string
    onPublish: () => void
    onBack: () => void
    isPublishing: boolean
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
                <Button variant="outline" onClick={onBack} disabled={isPublishing}>
                    Back
                </Button>
                <Button onClick={onPublish} loading={isPublishing}>
                    Confirm
                </Button>
            </Group>
        </Stack>
    )
}
