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

// okay I have a lo-fi for this feature. it looks different than i planned.
// I think today I can finish the upload modal,
// and start working on displaying the uploaded thign and its versions!

function UploadModalContents({
    doctype,
    draft,
    onClose,
}: {
    doctype: LegalDocumentType
    draft: string
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
    const [legalModalOpened, { open: openLegalModal, close: closeLegalModal }] = useDisclosure(false)

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['legalVersions', doctype],
        queryFn: () => fetchLegalDocumentVersionsAction({ type: doctype }),
    })
    const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false)

    if (isLoading || !data) return <LoadingMessage message="Loading..." />
    if (isError) return <ErrorAlert error={error} />

    const label = legalDocumentTypeLabels[doctype]

    const handleViewCurrent = () => {
        openViewModal()
    }

    return (
        <Paper>
            <Stack p="sm">
                <Flex justify="space-between" align="center">
                    <Title>{label}</Title>
                    <Button onClick={openLegalModal}>
                        <FileArrowUpIcon />
                        <Text ml="xs">Upload</Text>
                    </Button>
                </Flex>
                <Group>
                    <Anchor component="button" onClick={handleViewCurrent}>
                        View current
                    </Anchor>
                    <AppModal title="Review current version" isOpen={viewModalOpened} onClose={closeViewModal}>
                        <PreviewDocument url={data.current.downloadUrl} label={doctype} />
                    </AppModal>
                    <Text>Published on {data.current.publishedAt.toString()}</Text>
                </Group>
                <AppModal title={label} isOpen={legalModalOpened} onClose={closeLegalModal}>
                    <UploadModalContents doctype={doctype} draft={data.draft} onClose={closeLegalModal} />
                </AppModal>
                <Text>TBD Review Older Versions</Text>
                <Text>TBD User Acknowledgment Status</Text>
            </Stack>
        </Paper>
    )
}
