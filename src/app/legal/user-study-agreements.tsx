'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    studyAgreementDisplayTitle,
    type UserStudyAgreementSort,
} from '@/schema/legal-document'
import { fetchUserStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import type { DataTableColumn } from 'mantine-datatable'
import { agreementDateColumns, AgreementsPanel } from './agreements-table'

type StudyAgreement = ActionSuccessType<typeof fetchUserStudyAgreementsAction>[number]

// Raw uuid: no short display id exists, and truncating would show something that matches nothing.
const columns: DataTableColumn<StudyAgreement>[] = [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    { accessor: 'studyTitle', title: 'Study title', sortable: true, render: studyAgreementDisplayTitle },
    { accessor: 'fromName', title: 'From' },
    { accessor: 'toName', title: 'To' },
    ...agreementDateColumns<StudyAgreement>(),
]

const SORTABLE_COLUMNS = ['studyId', 'studyTitle', 'signedAt', 'ackedAt'] as const

// The page is about what the user signed, so every table leads with when they signed it.
const DEFAULT_SORT: UserStudyAgreementSort = { columnAccessor: 'ackedAt', direction: 'desc' }

export const UserStudyAgreements: FC = () => (
    <AgreementsPanel
        label={legalDocumentTypeLabels.SLA}
        idAccessor="studyId"
        columns={columns}
        sortableColumns={SORTABLE_COLUMNS}
        defaultSort={DEFAULT_SORT}
        queryKey={legalDocumentQueryKeys.userStudyAgreements}
        queryFn={(sort) => fetchUserStudyAgreementsAction({ sort })}
    />
)
