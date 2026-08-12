'use client'

import { useMutation, useQuery, useQueryClient, useState } from '@/common'
import { Paper, Stack, Title, Text, Button, Flex, Group, Anchor, Collapse } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { LegalDocumentType } from '@/database/types'
import { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, legalDocumentTypeLabels } from '@/schema/legal-document'
import { ConfirmPublishForm, DraftForm, PreviewDocument, ReviewPrePublishForm } from './upload-modal-pages'
import { useDisclosure } from '@mantine/hooks'
import {
    fetchLegalDocumentVersionsAction,
    publishLegalDocumentVersionAction,
} from '@/server/actions/legal-document.actions'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert, reportError } from '@/components/errors'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'
import { ToggleChevron } from '@/components/icons'

type PublishedVersion = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['current']>

type ModalPage = 'upload' | 'review' | 'confirm'

export type Draft = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['draft']>

function UploadModalContents({
    doctype,
    draft,
    onClose,
}: {
    doctype: LegalDocumentType
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
        onError: (error: unknown) => reportError(error, 'Could not publish'),
    })

    // Review + Confirm require a draft. If there is no draft, but page state is different, still show the upload page.
    if (page === 'upload' || !draft) {
        return <DraftForm doctype={doctype} draftName={draft?.fileName ?? null} onDraftSaved={handleDraftSaved} />
    }
    if (page === 'review') {
        return (
            <ReviewPrePublishForm
                doctype={doctype}
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
            />
        )
    }
}

function ShowVersion({ version, doctype }: { version: PublishedVersion; doctype: LegalDocumentType }) {
    const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false)

    const label = legalDocumentTypeLabels[doctype]
    const publishedOn = dayjs(version.publishedAt).format('MM/DD/YYYY')
    const versionNumber = version.versionNumber.toString().padStart(6, '0')

    return (
        <Group>
            <Anchor component="button" onClick={openViewModal}>
                {doctype.toUpperCase()}
                {versionNumber}
            </Anchor>
            <AppModal title="Review version" isOpen={viewModalOpened} onClose={closeViewModal}>
                <PreviewDocument url={version.downloadUrl} label={label} />
            </AppModal>
            <Text>Published on {publishedOn}</Text>
        </Group>
    )
}

function VersionHistory({ history, doctype }: { history: PublishedVersion[]; doctype: LegalDocumentType }) {
    const [opened, { toggle }] = useDisclosure(false)
    if (history.length === 0) return <Text>No past versions exist</Text>

    return (
        <>
            <Anchor component="button" onClick={toggle} aria-expanded={opened}>
                <Group gap="xs">
                    <ToggleChevron isExpanded={opened} />
                    {opened ? 'Hide version history' : 'View version history'}
                </Group>
            </Anchor>
            <Collapse in={opened}>
                <Stack>
                    {history.map((version) => {
                        return <ShowVersion key={version.versionNumber} version={version} doctype={doctype} />
                    })}
                </Stack>
            </Collapse>
        </>
    )
}

export function TosPnUpload({ doctype }: { doctype: 'TOS' | 'PN' }) {
    const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false)

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
                {data.current && <ShowVersion version={data.current} doctype={doctype} />}
                {!data.current && <Text>No published version yet</Text>}
                <VersionHistory history={data.history} doctype={doctype} />
                <AppModal title={label} isOpen={createModalOpened} onClose={closeCreateModal}>
                    <UploadModalContents doctype={doctype} draft={data.draft} onClose={closeCreateModal} />
                </AppModal>
                <Text>TBD User Acknowledgment Status</Text>
            </Stack>
        </Paper>
    )
}
