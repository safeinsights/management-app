'use client'

import { useQuery, useQueryClient } from '@/common'
import { Paper, Stack, Title, Text, Button, Flex, Group, Anchor } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { LegalDocumentType } from '@/database/types'
import { ActionSuccessType } from '@/lib/types'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { DraftForm, PreviewDocument, ReviewAndPublishForm, type Draft } from './document-modal'
import { useDisclosure } from '@mantine/hooks'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { LoadingMessage } from '@/components/loading'
import { ErrorAlert } from '@/components/errors'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'
import dayjs from 'dayjs'

// okay I have a lo-fi for this feature. it looks different than i planned.
// I think today I can finish the upload modal,
// and start working on displaying the uploaded thign and its versions!

type PublishedVersion = NonNullable<ActionSuccessType<typeof fetchLegalDocumentVersionsAction>['current']>

function UploadModalContents({
    doctype,
    draft,
    onClose,
}: {
    doctype: LegalDocumentType
    draft: Draft | null
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

function CurrentVersion({ current, doctype }: { current: PublishedVersion | null; doctype: LegalDocumentType }) {
    const [viewModalOpened, { open: openViewModal, close: closeViewModal }] = useDisclosure(false)

    if (!current) return <Text>No published version yet</Text>

    const label = legalDocumentTypeLabels[doctype]
    // publishedAt is nullable on the row type; `current` only ever holds published rows.
    const publishedOn = current.publishedAt ? dayjs(current.publishedAt).format('MMM DD, YYYY') : 'unknown date'

    return (
        <Group>
            <Anchor component="button" onClick={openViewModal}>
                View current
            </Anchor>
            <AppModal title="Review current version" isOpen={viewModalOpened} onClose={closeViewModal}>
                <PreviewDocument url={current.downloadUrl} label={label} />
            </AppModal>
            <Text>Published on {publishedOn}</Text>
        </Group>
    )
}

export function TosPnUpload({ doctype }: { doctype: 'tos' | 'pn' }) {
    const [legalModalOpened, { open: openLegalModal, close: closeLegalModal }] = useDisclosure(false)

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['legalVersions', doctype],
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
                    <Button onClick={openLegalModal}>
                        <FileArrowUpIcon />
                        <Text ml="xs">Upload</Text>
                    </Button>
                </Flex>
                <CurrentVersion current={data.current} doctype={doctype} />
                <AppModal title={label} isOpen={legalModalOpened} onClose={closeLegalModal}>
                    <UploadModalContents doctype={doctype} draft={data.draft} onClose={closeLegalModal} />
                </AppModal>
                <Text>TBD Review Older Versions</Text>
                <Text>TBD User Acknowledgment Status</Text>
            </Stack>
        </Paper>
    )
}
