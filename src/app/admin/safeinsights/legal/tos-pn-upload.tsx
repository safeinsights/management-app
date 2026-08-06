'use client'

import { useQuery, useQueryClient } from '@/common'
import { Paper, Stack, Title, Text, Button, Flex, Group } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { LegalDocumentType } from '@/database/types'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import { DraftForm, ReviewAndPublishForm } from './document-modal'
import { useDisclosure } from '@mantine/hooks'
import { fetchLegalDocumentVersionsAction } from '@/server/actions/legal-document.actions'
import { LoadingMessage } from '@/components/loading'
import { ErrorPanel } from '@/components/panel'
import { FileArrowUpIcon } from '@phosphor-icons/react/dist/ssr'

// okay I have a lo-fi for this feature. it looks different than i planned.
// I think today I can finish the upload modal,
// and start working on displaying the uploaded thign and its versions!

function UploadModalContents({ doctype, onClose }: { doctype: LegalDocumentType; onClose: () => void }) {
    const queryClient = useQueryClient()
    const { data, isLoading, isError } = useQuery({
        queryKey: ['legalVersions', doctype],
        queryFn: () => fetchLegalDocumentVersionsAction({ type: doctype }),
    })
    const handleDraftSaved = () => {
        queryClient.invalidateQueries({ queryKey: ['legalVersions', doctype] })
    }
    const handlePublished = () => {
        queryClient.invalidateQueries({ queryKey: ['legalVersions', doctype] })
        onClose()
    }
    if (isLoading || !data) return <LoadingMessage message="Loading..." />
    if (isError) return <ErrorPanel />
    return data.draft ? (
        <ReviewAndPublishForm doctype={doctype} draft={data.draft} onPublish={handlePublished} />
    ) : (
        <DraftForm doctype={doctype} onDraftSaved={handleDraftSaved} />
    )
}

export function TosPnUpload({ doctype }: { doctype: LegalDocumentType }) {
    const [legalModalOpened, { open: openLegalModal, close: closeLegalModal }] = useDisclosure(false)
    // retrieve current TOS URL

    if (doctype !== 'tos' && doctype !== 'pn') {
        throw new Error('Invalid doctype:' + doctype)
    }

    const label = legalDocumentTypeLabels[doctype]

    return (
        <Paper>
            <Stack p="sm">
                <Flex>
                    <Title>{label}</Title>
                    <Button justify="right" align="right" onClick={openLegalModal}>
                        <FileArrowUpIcon />
                        <Text ml="xs">Upload</Text>
                    </Button>
                </Flex>
                <Group>
                    <Text>Link to current Tos</Text>
                    <Text>Published on publish on date</Text>
                </Group>
                <AppModal title={label} isOpen={legalModalOpened} onClose={closeLegalModal}>
                    <UploadModalContents doctype={doctype} onClose={closeLegalModal} />
                </AppModal>
                <Text>TBD View Current Version</Text>
                <Text>TBD Review Older Versions</Text>
                <Text>TBD User Acknowledgment Status</Text>
            </Stack>
        </Paper>
    )
}
