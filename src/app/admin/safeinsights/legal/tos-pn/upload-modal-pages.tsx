'use client'

import { useMutation, useState, type FC } from '@/common'
import { reportError } from '@/components/errors'
import { uploadFiles } from '@/hooks/upload'
import { isActionError } from '@/lib/errors'
import { legalDocumentTypeLabels, type EnforcedLegalDocumentType } from '@/schema/legal-document'
import { createLegalDocumentDraftAction } from '@/server/actions/legal-document.actions'
import { Paper, Title, Button, Flex, Group, Text, Stack, ActionIcon } from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { notifications } from '@mantine/notifications'
import { UploadIcon, FileArrowUpIcon, ArrowCircleRightIcon, TrashIcon } from '@phosphor-icons/react/dist/ssr'
import { PreviewDocument } from '../preview-document'
import { ReadOnlyField } from '../read-only-field'

const SavedDraftField: FC<{ draftName: string | null }> = ({ draftName }) => {
    if (!draftName) return null

    return <ReadOnlyField label="Current saved draft:" value={draftName} />
}

const ChosenFileRow: FC<{ file: File | null; onRemove: () => void }> = ({ file, onRemove }) => {
    if (!file) return null

    return (
        <Group justify="space-between" align="center">
            <ReadOnlyField label="Uploaded:" value={file.name} />
            <ActionIcon color="red" variant="subtle" onClick={onRemove} mt={4}>
                <TrashIcon size={16} />
            </ActionIcon>
        </Group>
    )
}

export function DraftForm({
    doctype,
    draftName,
    onDraftSaved,
}: {
    doctype: EnforcedLegalDocumentType
    draftName: string | null
    onDraftSaved: () => void
}) {
    const [file, setFile] = useState<File | null>(null)

    const handleDrop = (files: File[]) => {
        const draftFile = files[0]
        if (draftFile) setFile(draftFile)
    }

    const handleReject = () => {
        notifications.show({
            color: 'red',
            title: 'Unsupported file',
            message: 'Please upload a single Markdown (.md) file.',
        })
    }
    // Both steps sit inside the mutation so an action error or a rejected S3 upload lands in
    // onError rather than as an unhandled rejection.
    const saveDraft = useMutation({
        mutationFn: async (draftFile: File) => {
            const result = await createLegalDocumentDraftAction({ type: doctype, fileName: draftFile.name })
            if (isActionError(result)) return result
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
                    <SavedDraftField draftName={draftName} />
                    <ChosenFileRow file={file} onRemove={onRemove} />
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
    draftId,
    draftUrl,
    onBack,
    onConfirm,
}: {
    doctype: EnforcedLegalDocumentType
    draftId: string
    draftUrl: string
    onBack: () => void
    onConfirm: () => void
}) {
    return (
        <Stack>
            <Title order={4} pb="sm">
                Review your saved draft:
            </Title>
            <PreviewDocument versionId={draftId} url={draftUrl} label={legalDocumentTypeLabels[doctype]} />
            <Group pt="md">
                <Button variant="outline" onClick={onBack}>
                    Back
                </Button>
                <Button onClick={onConfirm}>Publish</Button>
            </Group>
        </Stack>
    )
}

// `isSettled` keeps Confirm disabled after a successful publish: the form stays mounted, and a
// second click would publish twice.
export function ConfirmPublishForm({
    draftName,
    onPublish,
    onBack,
    isPublishing,
    isSettled,
}: {
    draftName: string
    onPublish: () => void
    onBack: () => void
    isPublishing: boolean
    isSettled: boolean
}) {
    return (
        <Stack>
            <Title order={4} pb="sm">
                Publish this file?
            </Title>
            <ReadOnlyField label="File" value={draftName} />
            <Text>
                Publishing asks every user to acknowledge the new version before they can keep using the app. This
                cannot be undone.
            </Text>
            <Group pt="md">
                <Button variant="outline" onClick={onBack} disabled={isPublishing}>
                    Back
                </Button>
                <Button onClick={onPublish} loading={isPublishing} disabled={isSettled}>
                    Confirm
                </Button>
            </Group>
        </Stack>
    )
}
