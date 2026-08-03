'use client'

import { Button } from '@/common'
import { Paper, Stack, Title, Text } from '@mantine/core'
import { AppModal } from '@/components/modals/app-modal'
import { LegalDocumentType } from '@/database/types'
import { legalDocumentTypeLabels } from '@/schema/legal-document'
import DraftForm from './draft-form'
import { useDisclosure } from '@mantine/hooks'

export default function LegalUpload({ doctype }: { doctype: LegalDocumentType }) {
    const [legalModalOpened, { open: openLegalModal, close: closeLegalModal }] = useDisclosure(false)

    if (doctype !== 'tos' && doctype !== 'pn') {
        return <div>not implemented</div>
    }

    const label = legalDocumentTypeLabels[doctype]

    return (
        <Paper>
            <Stack p="sm">
                <Title>{label}</Title>
                <Button onClick={openLegalModal}>Upload New {label}</Button>
                <AppModal title={label} isOpen={legalModalOpened} onClose={closeLegalModal}>
                    <DraftForm doctype={doctype} />
                </AppModal>
                <Text>TBD Review Draft & Publish</Text>
                <Text>TBD View Current Version</Text>
                <Text>TBD Review Older Versions</Text>
                <Text>TBD User Acknowledgment Status</Text>
            </Stack>
        </Paper>
    )
}
