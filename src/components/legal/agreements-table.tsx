'use client'

import { keepPreviousData, useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalPanel } from '@/components/legal/legal-panel'
import type { ActionResponse } from '@/lib/errors'
import { formatDayString, formatInstantAsUtcDay } from '@/lib/dates'
import { LegalDocumentPdfLink } from '@/components/legal/pdf-link'
import { Stack, Text } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useState, type ReactNode } from 'react'

type AgreementRow = { signedAt: string | null; ackedAt: Date; versionId: string | null }

type AgreementSort<Column extends string> = { columnAccessor: Column; direction: 'asc' | 'desc' }

// signedAt is a bare calendar day; ackedAt reads as a UTC day, matching the global document panel.
// On mixed bases an ack can show as a day earlier than the document it acknowledges.
export const agreementDateColumns = <T extends AgreementRow>(): DataTableColumn<T>[] => [
    { accessor: 'signedAt', title: 'Effective on', sortable: true, render: (row) => formatDayString(row.signedAt) },
    {
        accessor: 'ackedAt',
        title: 'Acknowledged on',
        sortable: true,
        render: (row) => formatInstantAsUtcDay(row.ackedAt),
    },
    { accessor: 'versionId', title: 'View', render: (row) => <LegalDocumentPdfLink versionId={row.versionId} /> },
]

type Props<T, Column extends string> = {
    label: string
    idAccessor: string
    columns: DataTableColumn<T>[]
    sortableColumns: readonly Column[]
    defaultSort: AgreementSort<Column>
    queryKey: (sort: AgreementSort<Column>) => readonly unknown[]
    queryFn: (sort: AgreementSort<Column>) => Promise<ActionResponse<T[]>>
    // For a table that lists something other than the reader's own acknowledgements.
    emptyState?: ReactNode
}

const NothingAcknowledged: FC<{ label: string }> = ({ label }) => (
    <Stack gap={4} align="center">
        <Text>You have not acknowledged any {label} yet</Text>
    </Stack>
)

const EMPTY_ROWS: never[] = []

const useAgreements = <T, Column extends string>({
    sortableColumns,
    defaultSort,
    queryKey,
    queryFn,
}: Props<T, Column>) => {
    const [sort, setSort] = useState(defaultSort)
    const {
        data: records = EMPTY_ROWS as T[],
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: queryKey(sort),
        queryFn: () => queryFn(sort),
        // Rows hold still through a re-sort, so the table never flashes its empty state mid-click.
        placeholderData: keepPreviousData,
    })

    // mantine-datatable widens columnAccessor to string, so an unsortable column would otherwise
    // reach the server as a bad param.
    const onSortStatusChange = ({ columnAccessor, direction }: DataTableSortStatus<T>) => {
        const accessor = sortableColumns.find((column) => column === columnAccessor)
        if (accessor) setSort({ columnAccessor: accessor, direction })
    }

    return { records, isLoading, isError, error, sort, onSortStatusChange }
}

// A refused read must not fall through to the table, where it looks like nothing was signed.
const AgreementsTable = <T, Column extends string>(props: Props<T, Column>) => {
    const { records, isLoading, isError, error, sort, onSortStatusChange } = useAgreements(props)
    const emptyState = props.emptyState ?? <NothingAcknowledged label={props.label} />

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
            emptyState={emptyState}
            records={records}
            columns={props.columns}
            sortStatus={sort}
            onSortStatusChange={onSortStatusChange}
        />
    )
}

export const AgreementsPanel = <T, Column extends string>(props: Props<T, Column>) => (
    <LegalPanel title={props.label}>
        <AgreementsTable {...props} />
    </LegalPanel>
)
