'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    type GlobalLegalDocumentType,
    type LegalDocumentAcknowledgementSort,
} from '@/schema/legal-document'
import { fetchLegalDocumentAcknowledgementsAction } from '@/server/actions/legal-document.actions'
import { Stack, Title } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { formatInstant } from '@/lib/dates'

type AcknowledgementRow = ActionSuccessType<typeof fetchLegalDocumentAcknowledgementsAction>['users'][number]

const DEFAULT_SORT: LegalDocumentAcknowledgementSort = { columnAccessor: 'fullName', direction: 'asc' }

export const ACKNOWLEDGEMENTS_PAGE_SIZE = 25

// mantine-datatable reports the accessor as a bare string, so a change from a column the action
// cannot order by leaves the current sort alone rather than reaching the server as a bad param.
const isSortable = (accessor: string): accessor is LegalDocumentAcknowledgementSort['columnAccessor'] =>
    accessor === 'fullName' || accessor === 'email' || accessor === 'ackedAt'

const ACKNOWLEDGEMENT_COLUMNS: DataTableColumn<AcknowledgementRow>[] = [
    { accessor: 'fullName', title: 'Name', sortable: true },
    { accessor: 'email', title: 'Email', sortable: true },
    {
        accessor: 'orgs',
        title: 'Organization',
        render: (row) => row.orgs.map((org) => org.name).join(', ') || '—',
    },
    {
        accessor: 'acknowledgedVersionNumber',
        title: 'Version agreed',
        // A user who has agreed to nothing is the point of the audit, so it reads as a word rather
        // than the dash used for merely absent values.
        render: (row) => row.acknowledgedVersionNumber ?? 'None',
    },
    {
        accessor: 'ackedAt',
        title: 'Agreed on',
        sortable: true,
        render: (row) => formatInstant(row.ackedAt),
    },
]

// Sorted server-side: the action builds the audience in memory from every user, so ordering it is
// part of the read.
const useAcknowledgements = (type: GlobalLegalDocumentType) => {
    const [sort, setSort] = useState<LegalDocumentAcknowledgementSort>(DEFAULT_SORT)
    const [page, setPage] = useState(1)
    const { data, isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.acknowledgements(type, sort),
        queryFn: () => fetchLegalDocumentAcknowledgementsAction({ type, sort }),
    })

    const onSortStatusChange = ({ columnAccessor, direction }: DataTableSortStatus<AcknowledgementRow>) => {
        const accessor = String(columnAccessor)
        if (!isSortable(accessor)) return
        setSort({ columnAccessor: accessor, direction })
        // A re-sort reorders the whole audience, so the page the reader was on no longer means anything.
        setPage(1)
    }

    // Paged in the browser: the action returns the audience in one read, so this bounds what is
    // rendered rather than what is fetched.
    const users = data?.users ?? []
    const start = (page - 1) * ACKNOWLEDGEMENTS_PAGE_SIZE

    return {
        records: users.slice(start, start + ACKNOWLEDGEMENTS_PAGE_SIZE),
        totalRecords: users.length,
        isLoading,
        sort,
        onSortStatusChange,
        page,
        setPage,
    }
}

// Every user in the app, with the version of this document they last agreed to. The audience is
// derived rather than stored, so someone who has never agreed is a row with no version, not a
// missing row.
export const AcknowledgementsTable: FC<{ type: GlobalLegalDocumentType }> = ({ type }) => {
    const { records, totalRecords, isLoading, sort, onSortStatusChange, page, setPage } = useAcknowledgements(type)

    return (
        <Stack>
            <Title order={4}>{legalDocumentTypeLabels[type]} acknowledgements</Title>
            <DataTable
                withTableBorder
                horizontalSpacing="md"
                verticalSpacing="sm"
                fetching={isLoading}
                idAccessor="userId"
                noRecordsText="No users to show"
                records={records}
                columns={ACKNOWLEDGEMENT_COLUMNS}
                sortStatus={sort}
                onSortStatusChange={onSortStatusChange}
                totalRecords={totalRecords}
                recordsPerPage={ACKNOWLEDGEMENTS_PAGE_SIZE}
                page={page}
                onPageChange={setPage}
            />
        </Stack>
    )
}
