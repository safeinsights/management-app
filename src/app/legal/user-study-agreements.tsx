'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, legalDocumentTypeLabels, studyAgreementDisplayTitle } from '@/schema/legal-document'
import { fetchUserStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import type { DataTableColumn } from 'mantine-datatable'
import { agreementDateColumns, agreementDateSortValues, AgreementsPanel } from './agreements-table'

type StudyAgreement = ActionSuccessType<typeof fetchUserStudyAgreementsAction>[number]

// Raw uuid: no short display id exists, and truncating would show something that matches nothing.
const columns: DataTableColumn<StudyAgreement>[] = [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    { accessor: 'studyTitle', title: 'Study title', sortable: true, render: studyAgreementDisplayTitle },
    { accessor: 'fromName', title: 'From' },
    { accessor: 'toName', title: 'To' },
    ...agreementDateColumns<StudyAgreement>(),
]

const sortValues = {
    ...agreementDateSortValues<StudyAgreement>(),
    studyId: (row: StudyAgreement) => row.studyId,
    studyTitle: studyAgreementDisplayTitle,
}

export const UserStudyAgreements: FC = () => (
    <AgreementsPanel
        label={legalDocumentTypeLabels.SLA}
        idAccessor="studyId"
        columns={columns}
        sortValues={sortValues}
        tieBreakBy="studyTitle"
        queryKey={legalDocumentQueryKeys.userStudyAgreements()}
        queryFn={fetchUserStudyAgreementsAction}
    />
)
