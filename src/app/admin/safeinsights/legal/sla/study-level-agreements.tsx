'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { AppModal } from '@/components/modals/app-modal'
import { Anchor, Button, Flex, Stack, Title } from '@mantine/core'
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

const NewVersionButton: FC<{ sla: Sla; onClick: (sla: Sla) => void }> = ({ sla, onClick }) => (
    <Button variant="subtle" size="compact-sm" onClick={() => onClick(sla)}>
        Upload new version
    </Button>
)

export const StudyLevelAgreements: FC = () => {
    const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false)
    const [newVersionFor, setNewVersionFor] = useState<Sla | null>(null)
    const { data = [], isLoading } = useQuery({
        queryKey: ['studyLevelAgreements'],
        queryFn: fetchStudyLevelAgreementsAction,
    })

    const closeNewVersion = () => setNewVersionFor(null)

    return (
        <Stack>
            <Flex justify="space-between" align="center">
                <Title order={2}>Study Level Agreements</Title>
                <Button onClick={openUpload}>Upload signed SLA</Button>
            </Flex>
            <AppModal
                isOpen={uploadOpened}
                onClose={closeUpload}
                title="Upload a signed SLA"
                closeOnClickOutside={false}
            >
                <UploadSlaForm onCompleteAction={closeUpload} />
            </AppModal>
            <AppModal
                isOpen={Boolean(newVersionFor)}
                onClose={closeNewVersion}
                title="Upload a new version"
                closeOnClickOutside={false}
            >
                {/* Keyed by study so a second row opens a fresh form rather than the last one's file. */}
                <UploadSlaForm
                    key={newVersionFor?.studyId}
                    onCompleteAction={closeNewVersion}
                    sla={newVersionFor ?? undefined}
                />
            </AppModal>
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
                        render: (sla) => <NewVersionButton sla={sla} onClick={setNewVersionFor} />,
                    },
                ]}
            />
        </Stack>
    )
}
