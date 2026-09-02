'use client'

import { useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { formatDayString, formatInstant } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    type ParticipationAgreementType,
} from '@/schema/legal-document'
import { fetchUserParticipationAgreementsAction } from '@/server/actions/legal-document.actions'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useMemo, useState } from 'react'
import { AgreementsEmptyState, LegalPanel } from './legal-panel'
import { PdfCell } from './pdf-cell'
import { sortAgreements } from './sort-agreements'

type ParticipationAgreement = ActionSuccessType<typeof fetchUserParticipationAgreementsAction>[number]

const DEFAULT_SORT: DataTableSortStatus<ParticipationAgreement> = { columnAccessor: 'ackedAt', direction: 'desc' }

const EMPTY_ROWS: ParticipationAgreement[] = []

const columns: DataTableColumn<ParticipationAgreement>[] = [
    { accessor: 'orgName', title: 'Organization', sortable: true },
    {
        accessor: 'signedAt',
        title: 'Effective on',
        sortable: true,
        render: (agreement) => formatDayString(agreement.signedAt),
    },
    {
        accessor: 'ackedAt',
        title: 'Acknowledged on',
        sortable: true,
        render: (agreement) => formatInstant(agreement.ackedAt),
    },
    {
        accessor: 'downloadUrl',
        title: 'View',
        render: (agreement) => <PdfCell downloadUrl={agreement.downloadUrl} />,
    },
]

const sortValues: Record<string, (row: ParticipationAgreement) => string | number> = {
    orgName: (row) => row.orgName,
    signedAt: (row) => row.signedAt ?? '',
    ackedAt: (row) => new Date(row.ackedAt).getTime(),
}

const useUserParticipationAgreements = (type: ParticipationAgreementType) => {
    const {
        data: agreements = EMPTY_ROWS,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.userParticipationAgreements(type),
        queryFn: () => fetchUserParticipationAgreementsAction({ type }),
    })
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<ParticipationAgreement>>(DEFAULT_SORT)

    const records = useMemo(
        () => sortAgreements(agreements, sortStatus, sortValues, (row) => row.orgName),
        [agreements, sortStatus],
    )

    return { records, isLoading, isError, error, sortStatus, setSortStatus }
}

const ParticipationAgreementsTable: FC<{ type: ParticipationAgreementType }> = ({ type }) => {
    const { records, isLoading, isError, error, sortStatus, setSortStatus } = useUserParticipationAgreements(type)

    if (isError) return <ErrorAlert error={error} />

    return (
        <DataTable
            withTableBorder
            horizontalSpacing="md"
            verticalSpacing="sm"
            // The empty state is an absolute overlay, so with no rows it has no room to draw in.
            minHeight={140}
            fetching={isLoading}
            idAccessor="orgId"
            emptyState={<AgreementsEmptyState label={legalDocumentTypeLabels[type]} />}
            records={records}
            columns={columns}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
        />
    )
}

export const UserParticipationAgreements: FC<{ type: ParticipationAgreementType }> = ({ type }) => (
    <LegalPanel title={legalDocumentTypeLabels[type]}>
        <ParticipationAgreementsTable type={type} />
    </LegalPanel>
)
