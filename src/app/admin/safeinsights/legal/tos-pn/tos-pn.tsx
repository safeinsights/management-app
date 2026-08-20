'use client'

import { useMutation, useQuery, useQueryClient, useState } from '@/common'
import { Paper, Stack, Title, Text, Button, Flex, Group, Anchor } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, legalDocumentTypeLabels, type GlobalLegalDocumentType } from '@/schema/legal-document'
import { AcknowledgementsTable } from './acknowledgements-table'
import { ConfirmPublishForm, DraftForm, ReviewPrePublishForm } from './upload-modal-pages'
import { useDisclosure } from '@mantine/hooks'
import {
    fetchLegalDocumentVersionsAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert, reportMutationError } from '@/components/errors'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import { PreviewDocument } from '../preview-document'
import { formatInstant } from '../dates'
import { VersionHistoryModal } from '../version-history-modal'

type PublishedVersion = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['current']>

type ModalPage = 'upload' | 'review' | 'confirm'

export type Draft = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['draft']>

function UploadModalContents({
    doctype,
    draft,
    onClose,
}: {
    doctype: GlobalLegalDocumentType
    draft: Draft | null
    onClose: () => void
}) {
    const [page, setPage] = useState<ModalPage>(draft ? 'review' : 'upload')
    const queryClient = useQueryClient()
    const handleDraftSaved = async () => {
        await queryClient.invalidateQueries({ queryKey: legalDocumentQueryKeys.versionsForType(doctype) })
        setPage('review')
    }
    const publishDraft = useMutation({
        mutationFn: (versionId: string) => publishLegalDocumentVersionAction({ versionId }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: legalDocumentQueryKeys.versionsForType(doctype) })
            onClose()
        },
        onError: reportMutationError('Could not publish'),
    })

    // Review + Confirm require a draft. If there is no draft, but page state is different, still show the upload page.
    if (page === 'upload' || !draft) {
        return <DraftForm doctype={doctype} draftName={draft?.fileName ?? null} onDraftSaved={handleDraftSaved} />
    }
    if (page === 'review') {
        return (
            <ReviewPrePublishForm
                doctype={doctype}
                draftId={draft.id}
                draftUrl={draft.downloadUrl}
                onBack={() => setPage('upload')}
                onConfirm={() => setPage('confirm')}
            />
        )
    } else {
        return (
            <ConfirmPublishForm
                draftName={draft.fileName}
                onBack={() => setPage('review')}
                onPublish={() => publishDraft.mutate(draft.id)}
                isPublishing={publishDraft.isPending}
                isSettled={publishDraft.isSuccess}
            />
        )
    }
}

// What is live right now, without a click. Prior versions live in the shared VersionHistoryModal,
// the same one the participation and study-level tables open.
function CurrentVersion({ version, doctype }: { version: PublishedVersion | null; doctype: GlobalLegalDocumentType }) {
    const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false)

    if (!version) return <Text>No published version yet</Text>

    const label = legalDocumentTypeLabels[doctype]

    return (
        <Group>
            <Anchor component="button" type="button" onClick={openViewModal}>
                Version {version.versionNumber}
            </Anchor>
            <AppModal title="Review version" isOpen={viewModalOpened} onClose={closeViewModal}>
                <PreviewDocument versionId={version.id} url={version.downloadUrl} label={label} />
            </AppModal>
            <Text>Published on {formatInstant(version.publishedAt)}</Text>
        </Group>
    )
}

export function TosPnPanel({ doctype }: { doctype: GlobalLegalDocumentType }) {
    const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false)
    const [historyOpened, { open: openHistory, close: closeHistory }] = useDisclosure(false)

    const { data, isLoading, isError, error } = useQuery({
        queryKey: legalDocumentQueryKeys.versions({ type: doctype }),
        queryFn: () => fetchLegalDocumentVersionsAction({ type: doctype }),
    })

    // isError first: data stays undefined after a failed query, so the !data check would
    // otherwise leave the panel on the loading message forever.
    if (isError) return <ErrorAlert error={error} />
    if (isLoading || !data) return <LoadingMessage message="Loading..." />

    const label = legalDocumentTypeLabels[doctype]

    return (
        <Paper>
            <Stack p="sm">
                <Flex justify="space-between" align="center">
                    <Title>{label}</Title>
                    <Button onClick={openCreateModal}>
                        <FileArrowUpIcon />
                        <Text ml="xs">Upload</Text>
                    </Button>
                </Flex>
                <CurrentVersion version={data.current} doctype={doctype} />
                <Group>
                    <Anchor component="button" type="button" onClick={openHistory}>
                        Version History
                    </Anchor>
                </Group>
                <VersionHistoryModal
                    isOpen={historyOpened}
                    onClose={closeHistory}
                    title={`${label} — version history`}
                    scope={{ type: doctype }}
                />
                <AppModal title={label} isOpen={createModalOpened} onClose={closeCreateModal}>
                    <UploadModalContents doctype={doctype} draft={data.draft} onClose={closeCreateModal} />
                </AppModal>
                <AcknowledgementsTable type={doctype} />
            </Stack>
        </Paper>
    )
}
