'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { AppModal } from '@/components/modals/app-modal'
import { Anchor, Button, Flex, Stack, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { UploadSlaForm } from './upload-sla-form'
import { VersionHistoryModal } from '../version-history-modal'

type Sla = ActionSuccessType<typeof fetchStudyLevelAgreementsAction>[number]

// Built here rather than inline in the JSX, and DataTable rather than a bare Table so that fetching
// and noRecordsText come from the component the rest of this admin section already uses.
const slaColumns = ({
    onNewVersion,
    onViewHistory,
}: {
    onNewVersion: (sla: Sla) => void
    onViewHistory: (sla: Sla) => void
}): DataTableColumn<Sla>[] => [
    { accessor: 'studyId', title: 'Study ID' },
    // study.title is nullable, and the upload cascade already falls back to the id.
    { accessor: 'studyTitle', title: 'Study', render: (sla) => sla.studyTitle || sla.studyId },
    { accessor: 'researchLabName', title: 'Research Lab' },
    { accessor: 'dataPartnerName', title: 'Data Partner' },
    { accessor: 'versionNumber', title: 'Version' },
    { accessor: 'signedAt', title: 'Signed on', render: (sla) => sla.signedAt ?? '—' },
    {
        accessor: 'downloadUrl',
        title: 'Agreement',
        render: (sla) => (
            <Anchor href={sla.downloadUrl} target="_blank" rel="noreferrer">
                View PDF
            </Anchor>
        ),
    },
    {
        accessor: 'history',
        title: 'History',
        render: (sla) => (
            <Anchor component="button" type="button" onClick={() => onViewHistory(sla)}>
                Version History
            </Anchor>
        ),
    },
    {
        accessor: 'actions',
        title: '',
        render: (sla) => (
            <Button variant="subtle" size="compact-sm" onClick={() => onNewVersion(sla)}>
                Upload new version
            </Button>
        ),
    },
]

export const StudyLevelAgreements: FC = () => {
    const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false)
    const [newVersionFor, setNewVersionFor] = useState<Sla | null>(null)
    const [historyFor, setHistoryFor] = useState<Sla | null>(null)
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.studyLevelAgreements(),
        queryFn: fetchStudyLevelAgreementsAction,
    })

    const closeNewVersion = () => setNewVersionFor(null)
    const closeHistory = () => setHistoryFor(null)
    const columns = slaColumns({ onNewVersion: setNewVersionFor, onViewHistory: setHistoryFor })

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
            <VersionHistoryModal
                isOpen={Boolean(historyFor)}
                onClose={closeHistory}
                title={`${historyFor?.studyTitle ?? ''} — version history`}
                scope={{ type: 'SLA', studyId: historyFor?.studyId }}
            />
            <DataTable
                withTableBorder
                horizontalSpacing="md"
                verticalSpacing="sm"
                fetching={isLoading}
                idAccessor="legalDocumentId"
                noRecordsText="No signed SLAs have been uploaded yet"
                records={agreements}
                columns={columns}
            />
        </Stack>
    )
}
