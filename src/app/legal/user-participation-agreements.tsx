'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentCollectionLabels,
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
    clampedColumn('40%', {
        accessor: 'orgName',
        title: 'Organization',
        render: ({ orgName }) => <TruncatedNameCell name={orgName} />,
    }),
    ...agreementDateColumns<ParticipationAgreement>(),
]

export const UserParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => (
    <AgreementsPanel
        label={legalDocumentCollectionLabels[type]}
        idAccessor="orgId"
        columns={columns}
        queryKey={() => legalDocumentQueryKeys.userParticipationAgreements(type)}
        queryFn={() => fetchUserParticipationAgreementsAction({ type })}
    />
)
