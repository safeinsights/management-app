'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import { fetchUserParticipationAgreementsAction } from '@/server/actions/legal-document.actions'
import type { DataTableColumn } from 'mantine-datatable'
import { agreementDateColumns, agreementDateSortValues, AgreementsPanel } from './agreements-table'

type ParticipationAgreement = ActionSuccessType<typeof fetchUserParticipationAgreementsAction>[number]

const columns: DataTableColumn<ParticipationAgreement>[] = [
    { accessor: 'orgName', title: 'Organization', sortable: true },
    ...agreementDateColumns<ParticipationAgreement>(),
]

const sortValues = {
    ...agreementDateSortValues,
    orgName: (row: ParticipationAgreement) => row.orgName,
}

export const UserParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => (
    <AgreementsPanel
        label={legalDocumentTypeLabels[type]}
        idAccessor="orgId"
        columns={columns}
        sortValues={sortValues}
        tieBreakBy="orgName"
        queryKey={legalDocumentQueryKeys.userParticipationAgreements(type)}
        queryFn={() => fetchUserParticipationAgreementsAction({ type })}
    />
)
