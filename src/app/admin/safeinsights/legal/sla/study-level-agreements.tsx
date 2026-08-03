'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Button, Flex, Modal, Stack, Title } from '@mantine/core'
import { FileTextIcon } from '@phosphor-icons/react/dist/ssr'
import { DataTable } from 'mantine-datatable'
import { UploadSlaForm, type SupersededSla } from './upload-sla-form'

type Sla = ActionSuccessType<typeof fetchStudyLevelAgreementsAction>[number]

// null closes the modal, 'new' collects a study via the cascade, an Sla adds a version to that study.
type UploadTarget = 'new' | Sla | null

// signed_at parses as a Date at local midnight, so format in UTC to get the day actually stored.
const formatSignedOn = (signedAt: Sla['signedAt']) => (signedAt ? new Date(signedAt).toISOString().slice(0, 10) : '—')

const supersededSlaFor = (target: UploadTarget): SupersededSla | undefined =>
    target && target !== 'new'
        ? {
              studyId: target.studyId,
              studyTitle: target.studyTitle,
              researchLabName: target.researchLabName,
              dataPartnerName: target.dataPartnerName,
              versionNumber: target.versionNumber,
          }
        : undefined

const AgreementLink: FC<{ sla: Sla }> = ({ sla }) => (
    <Anchor href={sla.downloadUrl} target="_blank" rel="noreferrer">
        View PDF
    </Anchor>
)

const NewVersionButton: FC<{ sla: Sla; onClick: (sla: Sla) => void }> = ({ sla, onClick }) => (
    <Button variant="subtle" size="compact-sm" onClick={() => onClick(sla)}>
        Upload new version
    </Button>
)

export const StudyLevelAgreements: FC = () => {
    const [target, setTarget] = useState<UploadTarget>(null)
    const { data = [], isLoading } = useQuery({
        queryKey: ['studyLevelAgreements'],
        queryFn: fetchStudyLevelAgreementsAction,
    })

    const closeUpload = () => setTarget(null)
    const supersedes = supersededSlaFor(target)

    return (
        <Stack>
            <Flex justify="space-between" align="center">
                <Title order={2}>Study Level Agreements</Title>
                <Button onClick={() => setTarget('new')}>Upload signed SLA</Button>
            </Flex>
            <Modal
                opened={Boolean(target)}
                onClose={closeUpload}
                title={supersedes ? 'Upload a new version' : 'Upload a signed SLA'}
                closeOnClickOutside={false}
                size="lg"
            >
                {/* Keyed so switching targets resets the wizard rather than reusing the last step and file. */}
                <UploadSlaForm
                    key={supersedes?.studyId ?? 'new'}
                    onCompleteAction={closeUpload}
                    supersedes={supersedes}
                />
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
                    {
                        accessor: 'actions',
                        title: '',
                        render: (sla) => <NewVersionButton sla={sla} onClick={setTarget} />,
                    },
                ]}
            />
        </Stack>
    )
}
