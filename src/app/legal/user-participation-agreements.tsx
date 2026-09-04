'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentCollectionLabels,
    type ParticipationAgreementType,
    type UserParticipationAgreementSort,
} from '@/schema/legal-document'
import { fetchUserParticipationAgreementsAction } from '@/server/actions/legal-document.actions'
import type { DataTableColumn } from 'mantine-datatable'
import { agreementDateColumns, AgreementsPanel } from '@/components/legal/agreements-table'

type ParticipationAgreement = ActionSuccessType<typeof fetchUserParticipationAgreementsAction>[number]

const columns: DataTableColumn<ParticipationAgreement>[] = [
    { accessor: 'orgName', title: 'Organization', sortable: true },
    ...agreementDateColumns<ParticipationAgreement>(),
]

const SORTABLE_COLUMNS = ['orgName', 'signedAt', 'ackedAt'] as const

// The page is about what the user signed, so every table leads with when they signed it.
const DEFAULT_SORT: UserParticipationAgreementSort = { columnAccessor: 'ackedAt', direction: 'desc' }

export const UserParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => (
    <AgreementsPanel
        label={legalDocumentCollectionLabels[type]}
        idAccessor="orgId"
        columns={columns}
        sortableColumns={SORTABLE_COLUMNS}
        defaultSort={DEFAULT_SORT}
        queryKey={(sort) => legalDocumentQueryKeys.userParticipationAgreements(type, sort)}
        queryFn={(sort) => fetchUserParticipationAgreementsAction({ type, sort })}
    />
)
