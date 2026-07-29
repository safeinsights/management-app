'use client'

import { useQuery, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Button, Flex, Modal, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { FileTextIcon } from '@phosphor-icons/react/dist/ssr'
import { DataTable } from 'mantine-datatable'
import { UploadSlaForm } from './upload-sla-form'

type Sla = ActionSuccessType<typeof fetchStudyLevelAgreementsAction>[number]

// signed_at parses as a Date at local midnight, so format in UTC to get the day actually stored.
const formatSignedOn = (signedAt: Sla['signedAt']) => (signedAt ? new Date(signedAt).toISOString().slice(0, 10) : '—')

const AgreementLink: FC<{ sla: Sla }> = ({ sla }) => (
    <Anchor href={sla.downloadUrl} target="_blank" rel="noreferrer">
        View PDF
    </Anchor>
)

export const StudyLevelAgreements: FC = () => {
    const [uploading, { open: startUpload, close: stopUpload }] = useDisclosure(false)
    const { data = [], isLoading } = useQuery({
        queryKey: ['studyLevelAgreements'],
        queryFn: fetchStudyLevelAgreementsAction,
    })

    return (
        <Stack>
            <Flex justify="space-between" align="center">
                <Title order={2}>Study Level Agreements</Title>
                <Button onClick={startUpload}>Upload signed SLA</Button>
            </Flex>
            <Modal
                opened={uploading}
                onClose={stopUpload}
                title="Upload a signed SLA"
                closeOnClickOutside={false}
                size="lg"
            >
                <UploadSlaForm onCompleteAction={stopUpload} />
            </Modal>
            <DataTable
                fetching={isLoading}
                withTableBorder
                withColumnBorders
                idAccessor="legalDocumentId"
                noRecordsText="No signed SLAs have been uploaded yet"
                noRecordsIcon={<FileTextIcon />}
                records={data as Sla[]}
                columns={[
                    { accessor: 'studyId', title: 'Study ID' },
                    { accessor: 'studyTitle', title: 'Study' },
                    { accessor: 'researchLabName', title: 'Research Lab' },
                    { accessor: 'dataPartnerName', title: 'Data Partner' },
                    { accessor: 'versionNumber', title: 'Version', textAlign: 'center' },
                    { accessor: 'signedAt', title: 'Signed on', render: (sla) => formatSignedOn(sla.signedAt) },
                    { accessor: 'downloadUrl', title: 'Agreement', render: (sla) => <AgreementLink sla={sla} /> },
                ]}
            />
        </Stack>
    )
}
