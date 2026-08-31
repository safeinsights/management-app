'use client'

import { useQuery, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchStudyLevelAgreementsAction } from '@/server/actions/legal-document.actions'
import { AppModal } from '@/components/modals/app-modal'
import { Button, Flex, Stack, Title } from '@mantine/core'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { UploadSlaForm } from './upload-sla-form'
import { documentColumn, newVersionColumn, useAgreementPanelModals, versionHistoryColumn } from '../agreement-panel'
import { formatDayString } from '@/lib/dates'
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
    { accessor: 'signedAt', title: 'Signed on', render: (sla) => formatDayString(sla.signedAt) },
    documentColumn<Sla>(),
    versionHistoryColumn(onViewHistory),
    newVersionColumn(onNewVersion),
]

export const StudyLevelAgreements: FC = () => {
    const {
        uploadOpened,
        openUpload,
        closeUpload,
        newVersionFor,
        openNewVersion,
        closeNewVersion,
        historyFor,
        openHistory,
        closeHistory,
    } = useAgreementPanelModals<Sla>()
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.studyLevelAgreements(),
        queryFn: fetchStudyLevelAgreementsAction,
    })

    const columns = slaColumns({ onNewVersion: openNewVersion, onViewHistory: openHistory })

    return (
        <Stack>
            <Flex justify="space-between" align="center">
                <Title order={2}>Study Agreements</Title>
                <Button onClick={openUpload}>Upload signed study agreement</Button>
            </Flex>
            <AppModal
                isOpen={uploadOpened}
                onClose={closeUpload}
                title="Upload a signed study agreement"
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
                noRecordsText="No study agreements have been uploaded yet"
                records={agreements}
                columns={columns}
            />
        </Stack>
    )
}
