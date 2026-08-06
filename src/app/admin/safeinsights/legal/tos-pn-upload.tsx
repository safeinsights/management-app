'use client'

import { useQuery, useQueryClient } from '@/common'
import { Paper, Stack, Title, Text, Button, Flex, Group, Anchor } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { LegalDocumentType } from '@/database/types'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { DraftForm, PreviewDocument, ReviewAndPublishForm } from './document-modal'
import { useDisclosure } from '@mantine/hooks'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert } from '@/components/errors'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import { ActionSuccessType } from '@/lib/types'

type Draft = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['draft']>

function UploadModalContents({
    doctype,
    draft,
    onClose,
}: {
    doctype: LegalDocumentType
    draft: Draft
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const handleDraftSaved = () => {
        queryClient.invalidateQueries({ queryKey: ['legalVersions', doctype] })
    }
    const handlePublished = () => {
        queryClient.invalidateQueries({ queryKey: ['legalVersions', doctype] })
        onClose()
    }
    return draft ? (
        <ReviewAndPublishForm doctype={doctype} draft={draft} onPublish={handlePublished} />
    ) : (
        <DraftForm doctype={doctype} onDraftSaved={handleDraftSaved} />
    )
}

export function TosPnUpload({ doctype }: { doctype: 'tos' | 'pn' }) {
    const [createModalOpened, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false)

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['legalVersions', doctype],
        queryFn: () => fetchLegalDocumentVersionsAction({ type: doctype }),
    })
    const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false)

    if (isLoading || !data) return <LoadingMessage message="Loading..." />
    if (isError) return <ErrorAlert error={error} />

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
                {data && data.current && (
                    <Group>
                        <Anchor component="button" onClick={openViewModal}>
                            View current
                        </Anchor>
                        <AppModal title="Review current version" isOpen={viewModalOpened} onClose={closeViewModal}>
                            <PreviewDocument
                                url={data.current.downloadUrl ? data.current.downloadUrl : ''}
                                label={doctype}
                            />
                        </AppModal>
                        <Text>Published on {data.current.publishedAt ? data.current.publishedAt.toString() : ''}</Text>
                    </Group>
                )}
                <AppModal title={label} isOpen={createModalOpened} onClose={closeCreateModal}>
                    <UploadModalContents doctype={doctype} draft={data.draft} onClose={closeCreateModal} />
                </AppModal>
                <Text>TBD Review Older Versions</Text>
                <Text>TBD User Acknowledgment Status</Text>
            </Stack>
        </Paper>
    )
}
