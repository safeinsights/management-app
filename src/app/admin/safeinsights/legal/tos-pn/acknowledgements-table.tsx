'use client'

import { useQuery, useState, type FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    type EnforcedLegalDocumentType,
    type LegalDocumentAcknowledgementSort,
} from '@/schema/legal-document'
import { fetchLegalDocumentAcknowledgementsAction } from '@/server/actions/legal-document.actions'
import { Stack, Title } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { formatInstant } from '@/lib/dates'

type AcknowledgementRow = ActionSuccessType<typeof fetchLegalDocumentAcknowledgementsAction>['users'][number]

const DEFAULT_SORT: LegalDocumentAcknowledgementSort = { columnAccessor: 'fullName', direction: 'asc' }

export const ACKNOWLEDGEMENTS_PAGE_SIZE = 25

// mantine-datatable reports the accessor as a bare string, so an unsortable column would otherwise
// reach the server as a bad param.
const isSortable = (accessor: string): accessor is LegalDocumentAcknowledgementSort['columnAccessor'] =>
    accessor === 'fullName' || accessor === 'email' || accessor === 'ackedAt' || accessor === 'lastLoginAt'

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
        render: (row) => row.acknowledgedVersionNumber ?? 'None',
    },
    {
        accessor: 'ackedAt',
        title: 'Agreed on',
        sortable: true,
        render: (row) => formatInstant(row.ackedAt),
    },
    {
        accessor: 'lastLoginAt',
        title: 'Last login',
        sortable: true,
        // A dash, not "Never": the trail does not reach back to the start of the app, so an absent
        // value means no record rather than no logins.
        render: (row) => formatInstant(row.lastLoginAt),
    },
]

const useAcknowledgements = (type: EnforcedLegalDocumentType) => {
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
        setPage(1)
    }

    // Paged in the browser: the action returns the whole audience in one read.
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

export const AcknowledgementsTable: FC<{ type: EnforcedLegalDocumentType }> = ({ type }) => {
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
