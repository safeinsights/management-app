'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentCollectionLabels,
    legalDocumentTypeLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import { fetchUserParticipationAgreementsAction } from '@/server/actions/user-legal.actions'
import type { DataTableColumn } from 'mantine-datatable'
import {
    agreementDateColumns,
    AgreementsPanel,
    clampedColumn,
    TruncatedNameCell,
} from '@/components/legal/agreements-table'

type ParticipationAgreement = ActionSuccessType<typeof fetchUserParticipationAgreementsAction>[number]

const columns: DataTableColumn<ParticipationAgreement>[] = [
    // Not a link: design has not yet decided whether an org name should open anything.
    // 100% so the name takes whatever the fixed-width columns leave.
    clampedColumn('100%', {
        accessor: 'orgName',
        title: 'Organization name',
        render: ({ orgName }) => <TruncatedNameCell name={orgName} />,
    }),
    ...agreementDateColumns<ParticipationAgreement>(),
]

export const UserParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => (
    <AgreementsPanel
        label={legalDocumentCollectionLabels[type]}
        title={legalDocumentTypeLabels[type]}
        idAccessor="orgId"
        columns={columns}
        queryKey={() => legalDocumentQueryKeys.userParticipationAgreements(type)}
        queryFn={() => fetchUserParticipationAgreementsAction({ type })}
    />
)
