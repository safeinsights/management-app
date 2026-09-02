'use client'

import { useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { formatDayString, formatInstant } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, legalDocumentTypeLabels, studyAgreementDisplayTitle } from '@/schema/legal-document'
import { fetchUserStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useMemo, useState } from 'react'
import { AgreementsEmptyState, LegalPanel } from './legal-panel'
import { PdfCell } from './pdf-cell'
import { sortAgreements } from './sort-agreements'

type StudyAgreement = ActionSuccessType<typeof fetchUserStudyAgreementsAction>[number]

// The page is about what the user signed, so it leads with when they signed it.
const DEFAULT_SORT: DataTableSortStatus<StudyAgreement> = { columnAccessor: 'ackedAt', direction: 'desc' }

// Stable identity so the sort memo survives renders while the query is loading.
const EMPTY_ROWS: StudyAgreement[] = []

// Raw uuid: no short display id exists, and truncating would show something that matches nothing.
const columns: DataTableColumn<StudyAgreement>[] = [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    { accessor: 'studyTitle', title: 'Study title', sortable: true, render: studyAgreementDisplayTitle },
    { accessor: 'fromName', title: 'From' },
    { accessor: 'toName', title: 'To' },
    {
        accessor: 'signedAt',
        title: 'Effective on',
        sortable: true,
        render: (agreement) => formatDayString(agreement.signedAt),
    },
    // Local, not UTC: signed_at is a timezone-less day off the signed document, so there is no
    // ordering to preserve between the two columns.
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

const sortValues: Record<string, (row: StudyAgreement) => string | number> = {
    studyId: (row) => row.studyId,
    studyTitle: studyAgreementDisplayTitle,
    signedAt: (row) => row.signedAt ?? '',
    ackedAt: (row) => new Date(row.ackedAt).getTime(),
}

const useUserStudyAgreements = () => {
    const {
        data: agreements = EMPTY_ROWS,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.userStudyAgreements(),
        queryFn: () => fetchUserStudyAgreementsAction(),
    })
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<StudyAgreement>>(DEFAULT_SORT)

    const records = useMemo(
        () => sortAgreements(agreements, sortStatus, sortValues, studyAgreementDisplayTitle),
        [agreements, sortStatus],
    )

    return { records, isLoading, isError, error, sortStatus, setSortStatus }
}

// A refused read must not fall through to the table, where it looks like nothing was signed.
const StudyAgreementsTable: FC = () => {
    const { records, isLoading, isError, error, sortStatus, setSortStatus } = useUserStudyAgreements()

    if (isError) return <ErrorAlert error={error} />

    return (
        <DataTable
            withTableBorder
            horizontalSpacing="md"
            verticalSpacing="sm"
            // The empty state is an absolute overlay, so with no rows it has no room to draw in.
            minHeight={140}
            fetching={isLoading}
            idAccessor="studyId"
            emptyState={<AgreementsEmptyState label={legalDocumentTypeLabels.SLA} />}
            records={records}
            columns={columns}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
        />
    )
}

export const UserStudyAgreements: FC = () => (
    <LegalPanel title={legalDocumentTypeLabels.SLA}>
        <StudyAgreementsTable />
    </LegalPanel>
)
