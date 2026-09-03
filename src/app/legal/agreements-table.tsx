'use client'

import { useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalPanel } from '@/components/legal/legal-panel'
import type { ActionResponse } from '@/lib/errors'
import { formatDayString, formatInstant } from '@/lib/dates'
import { PdfLink } from '@/components/legal/pdf-link'
import { Stack, Text } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useMemo, useState } from 'react'
import { sortAgreements, type SortColumn, type SortValues } from '@/lib/sort-agreements'

type AgreementRow = { signedAt: string | null; ackedAt: Date; downloadUrl: string | null }

// The page is about what the user signed, so every table leads with when they signed it.
const DEFAULT_SORT = { columnAccessor: 'ackedAt', direction: 'desc' } as const

// Shared by every table here: only the identifying columns differ per type.
export const agreementDateColumns = <T extends AgreementRow>(): DataTableColumn<T>[] => [
    { accessor: 'signedAt', title: 'Effective on', sortable: true, render: (row) => formatDayString(row.signedAt) },
    { accessor: 'ackedAt', title: 'Acknowledged on', sortable: true, render: (row) => formatInstant(row.ackedAt) },
    { accessor: 'downloadUrl', title: 'View', render: (row) => <PdfLink url={row.downloadUrl} /> },
]

// Typed against AgreementRow rather than each table's row: the accessors only read the shared
// fields, so they spread into any row that has them. A server timestamp can cross a server action
// as an ISO string, so ackedAt is re-wrapped rather than read as a Date.
export const agreementDateSortValues: SortValues<AgreementRow> = {
    signedAt: (row) => row.signedAt ?? '',
    ackedAt: (row) => new Date(row.ackedAt).toISOString(),
}

type Props<T> = {
    label: string
    idAccessor: string
    columns: DataTableColumn<T>[]
    sortValues: SortValues<T>
    tieBreakBy: SortColumn<T>
    queryKey: readonly unknown[]
    queryFn: () => Promise<ActionResponse<T[]>>
}

// All three agreement labels pluralise with a bare 's'.
const EmptyState: FC<{ label: string }> = ({ label }) => (
    <Stack gap={4} align="center">
        <Text>You have not acknowledged any {label}s yet</Text>
    </Stack>
)

// Stable identity so the sort memo survives renders while the query is loading.
const EMPTY_ROWS: never[] = []

const useSortedAgreements = <T,>({ queryKey, queryFn, sortValues, tieBreakBy }: Props<T>) => {
    const { data = EMPTY_ROWS as T[], isLoading, isError, error } = useQuery({ queryKey, queryFn })
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<T>>(DEFAULT_SORT)

    const records = useMemo(
        () => sortAgreements(data, sortStatus, { sortValues, tieBreakBy }),
        [data, sortStatus, sortValues, tieBreakBy],
    )

    return { records, isLoading, isError, error, sortStatus, setSortStatus }
}

// A refused read must not fall through to the table, where it looks like nothing was signed.
export const AgreementsTable = <T,>(props: Props<T>) => {
    const { records, isLoading, isError, error, sortStatus, setSortStatus } = useSortedAgreements(props)

    if (isError) return <ErrorAlert error={error} />

    return (
        <DataTable
            withTableBorder
            horizontalSpacing="md"
            verticalSpacing="sm"
            // The empty state is an absolute overlay, so with no rows it has no room to draw in.
            minHeight={140}
            fetching={isLoading}
            idAccessor={props.idAccessor}
            emptyState={<EmptyState label={props.label} />}
            records={records}
            columns={props.columns}
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
        />
    )
}

export const AgreementsPanel = <T,>(props: Props<T>) => (
    <LegalPanel title={props.label}>
        <AgreementsTable {...props} />
    </LegalPanel>
)
