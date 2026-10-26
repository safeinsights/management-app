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
import { Text, Tooltip } from '@mantine/core'
import { agreementDateColumns, AgreementsPanel, clampedCellsStyle } from '@/components/legal/agreements-table'

type ParticipationAgreement = ActionSuccessType<typeof fetchUserParticipationAgreementsAction>[number]

const TruncatedNameCell: FC<{ name: string }> = ({ name }) => (
    <Tooltip label={name} events={{ hover: true, focus: true, touch: true }} multiline maw={400}>
        <Text fz="sm" truncate="end">
            {name}
        </Text>
    </Tooltip>
)

const columns: DataTableColumn<ParticipationAgreement>[] = [
    // Not a link: design has not yet decided whether an org name should open anything.
    {
        accessor: 'orgName',
        title: 'Organization',
        ellipsis: true,
        width: '40%',
        cellsStyle: clampedCellsStyle,
        render: ({ orgName }) => <TruncatedNameCell name={orgName} />,
    },
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
