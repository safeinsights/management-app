'use client'

import { keepPreviousData, useQuery, type FC } from '@/common'
import { ErrorAlert } from '@/components/errors'
import { LegalPanel } from '@/components/legal/legal-panel'
import type { ActionResponse } from '@/lib/errors'
import { formatDayString, formatInstantAsUtcDay } from '@/lib/dates'
import { LegalDocumentPdfLink } from '@/components/legal/pdf-link'
import { Link } from '@/components/links'
import { studyAgreementDisplayTitle } from '@/schema/legal-document'
import { Stack, Text, Tooltip } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import type { Route } from 'next'
import { useState, type ReactNode } from 'react'

// ackedAt is nullable because a study row can stand in for an agreement that was never signed;
// participation rows always carry one.
type AgreementRow = {
    signedAt: string | null
    ackedAt: Date | null
    versionId: string | null
}

type AgreementSort<Column extends string> = { columnAccessor: Column; direction: 'asc' | 'desc' }

// `exemptionFor` lets a caller put something in a date cell for a row that will never carry one;
// the caller owns what that means, so this module stays free of any one document type's rules.
type Exemption<T> = (row: T) => ReactNode

// signedAt is a bare calendar day; ackedAt reads as a UTC day, matching the global document panel.
// On mixed bases an ack can show as a day earlier than the document it acknowledges.
export const signedAtColumn = <T extends Pick<AgreementRow, 'signedAt'>>(
    exemptionFor?: Exemption<T>,
): DataTableColumn<T> => ({
    accessor: 'signedAt',
    title: 'Effective on',
    render: (row) => <>{exemptionFor?.(row) ?? formatDayString(row.signedAt)}</>,
})

export const ackedAtColumn = <T extends Pick<AgreementRow, 'ackedAt'>>(
    exemptionFor?: Exemption<T>,
): DataTableColumn<T> => ({
    accessor: 'ackedAt',
    title: 'Acknowledged on',
    render: (row) => <>{exemptionFor?.(row) ?? formatInstantAsUtcDay(row.ackedAt)}</>,
})

export const versionColumn = <T extends Pick<AgreementRow, 'versionId'>>(): DataTableColumn<T> => ({
    accessor: 'versionId',
    title: 'View',
    render: (row) => <LegalDocumentPdfLink versionId={row.versionId} />,
})

export const agreementDateColumns = <T extends AgreementRow>(exemptionFor?: Exemption<T>): DataTableColumn<T>[] => [
    signedAtColumn(exemptionFor),
    ackedAtColumn(exemptionFor),
    versionColumn(),
]

// Fit-content, so only the title text is clickable, not the blank cell after a short title.
const StudyTitleCell: FC<{ title: string; href: Route }> = ({ title, href }) => (
    <Tooltip label={title} events={{ hover: true, focus: true, touch: true }} multiline maw={400}>
        <Link href={href} underline="hover" truncate="end" display="block" w="fit-content" maw="100%" fz="sm">
            {title}
        </Link>
    </Tooltip>
)

export const TruncatedNameCell: FC<{ name: string }> = ({ name }) => (
    <Tooltip label={name} events={{ hover: true, focus: true, touch: true }} multiline maw={400}>
        <Text fz="sm" truncate="end">
            {name}
        </Text>
    </Tooltip>
)

// In an auto-layout table a no-wrap cell grows to its text whatever its width says; a zero
// max-width drops that floor, so the percentage width is what the column gets.
export const clampedColumn = <T,>(
    width: string,
    column: DataTableColumn<T> & { noWrap?: never },
): DataTableColumn<T> => ({
    ...column,
    ellipsis: true,
    width,
    cellsStyle: () => ({ maxWidth: 0 }),
})

type StudyTitleRow = { studyTitle: string | null; studyId: string }

export const studyTitleColumn = <T extends StudyTitleRow>(hrefFor: (row: T) => Route): DataTableColumn<T> =>
    clampedColumn('35%', {
        accessor: 'studyTitle',
        title: 'Study title',
        sortable: true,
        render: (row) => <StudyTitleCell title={studyAgreementDisplayTitle(row)} href={hrefFor(row)} />,
    })

type BaseProps<T> = {
    label: string
    idAccessor: string
    columns: DataTableColumn<T>[]
    // For a table that lists something other than the reader's own acknowledgements.
    emptyState?: ReactNode
}

type SortedProps<T, Column extends string> = BaseProps<T> & {
    sorting: { sortableColumns: readonly Column[]; defaultSort: AgreementSort<Column> }
    queryKey: (sort: AgreementSort<Column>) => readonly unknown[]
    queryFn: (sort: AgreementSort<Column>) => Promise<ActionResponse<T[]>>
}

type UnsortedProps<T> = BaseProps<T> & {
    sorting?: never
    queryKey: () => readonly unknown[]
    queryFn: () => Promise<ActionResponse<T[]>>
}

// A union rather than optional fields, so a table either sorts end to end or not at all.
type Props<T, Column extends string> = SortedProps<T, Column> | UnsortedProps<T>

const NothingAcknowledged: FC<{ label: string }> = ({ label }) => (
    <Stack gap="xxs" align="center">
        <Text>You have not acknowledged any {label} yet</Text>
    </Stack>
)

const EMPTY_ROWS: never[] = []

// No choice yet means the caller's default, so that default lives in one place.
const queryFor = <T, Column extends string>(props: Props<T, Column>, chosenSort?: AgreementSort<Column>) => {
    if (!props.sorting) return { sort: undefined, queryKey: props.queryKey(), queryFn: () => props.queryFn() }

    const sort = chosenSort ?? props.sorting.defaultSort
    return { sort, queryKey: props.queryKey(sort), queryFn: () => props.queryFn(sort) }
}

const useAgreements = <T, Column extends string>(props: Props<T, Column>) => {
    const [chosenSort, setSort] = useState<AgreementSort<Column>>()
    const { sort, ...query } = queryFor(props, chosenSort)
    const {
        data: records = EMPTY_ROWS as T[],
        isLoading,
        isError,
        error,
    } = useQuery({
        ...query,
        // Rows hold still through a re-sort, so the table never flashes its empty state mid-click.
        placeholderData: keepPreviousData,
    })

    // mantine-datatable widens columnAccessor to string, so an unsortable column would otherwise
    // reach the server as a bad param.
    const onSortStatusChange = ({ columnAccessor, direction }: DataTableSortStatus<T>) => {
        const accessor = props.sorting?.sortableColumns.find((column) => column === columnAccessor)
        if (accessor) setSort({ columnAccessor: accessor, direction })
    }

    // DataTable takes both sort props or neither.
    const sortProps = sort ? { sortStatus: sort, onSortStatusChange } : {}

    return { records, isLoading, isError, error, sortProps }
}

// A refused read must not fall through to the table, where it looks like nothing was signed.
const AgreementsTable = <T, Column extends string>(props: Props<T, Column>) => {
    const { records, isLoading, isError, error, sortProps } = useAgreements(props)
    const emptyState = props.emptyState ?? <NothingAcknowledged label={props.label} />

    if (isError) return <ErrorAlert error={error} />

    return (
        <DataTable
            withTableBorder
            highlightOnHover
            horizontalSpacing="md"
            verticalSpacing="sm"
            // The empty state is an absolute overlay, so with no rows it has no room to draw in.
            minHeight={140}
            fetching={isLoading}
            idAccessor={props.idAccessor}
            emptyState={emptyState}
            records={records}
            columns={props.columns}
            {...sortProps}
        />
    )
}

export const AgreementsPanel = <T, Column extends string>(props: Props<T, Column>) => (
    <LegalPanel title={props.label}>
        <AgreementsTable {...props} />
    </LegalPanel>
)
