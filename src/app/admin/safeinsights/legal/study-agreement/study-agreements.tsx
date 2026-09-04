'use client'

import { useQuery, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys } from '@/schema/legal-document'
import { fetchStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { AppModal } from '@/components/modals/app-modal'
import { Button, Flex, Stack, Title } from '@mantine/core'
import { DataTable, type DataTableColumn } from 'mantine-datatable'
import { UploadStudyAgreementForm } from './upload-study-agreement-form'
import { documentColumn, newVersionColumn, useAgreementPanelModals, versionHistoryColumn } from '../agreement-panel'
import { formatDayString } from '@/lib/dates'
import { VersionHistoryModal } from '../version-history-modal'

type StudyAgreement = ActionSuccessType<typeof fetchStudyAgreementsAction>[number]

const studyAgreementColumns = ({
    onNewVersion,
    onViewHistory,
}: {
    onNewVersion: (agreement: StudyAgreement) => void
    onViewHistory: (agreement: StudyAgreement) => void
}): DataTableColumn<StudyAgreement>[] => [
    { accessor: 'studyId', title: 'Study ID' },
    { accessor: 'studyTitle', title: 'Study', render: (agreement) => agreement.studyTitle || agreement.studyId },
    { accessor: 'researchLabName', title: 'Research Lab' },
    { accessor: 'dataPartnerName', title: 'Data Partner' },
    { accessor: 'versionNumber', title: 'Version' },
    { accessor: 'signedAt', title: 'Signed on', render: (agreement) => formatDayString(agreement.signedAt) },
    documentColumn<StudyAgreement>(),
    versionHistoryColumn(onViewHistory),
    newVersionColumn(onNewVersion),
]

export const StudyAgreements: FC = () => {
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
    } = useAgreementPanelModals<StudyAgreement>()
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.studyAgreements(),
        queryFn: fetchStudyAgreementsAction,
    })

    const columns = studyAgreementColumns({ onNewVersion: openNewVersion, onViewHistory: openHistory })

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
                <UploadStudyAgreementForm onCompleteAction={closeUpload} />
            </AppModal>
            <AppModal
                isOpen={Boolean(newVersionFor)}
                onClose={closeNewVersion}
                title="Upload a new version"
                closeOnClickOutside={false}
            >
                <UploadStudyAgreementForm
                    key={newVersionFor?.studyId}
                    onCompleteAction={closeNewVersion}
                    agreement={newVersionFor ?? undefined}
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
