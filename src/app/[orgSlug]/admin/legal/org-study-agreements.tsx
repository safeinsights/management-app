'use client'

import { keepPreviousData, useQuery, type FC } from '@/common'
import type { OrgType } from '@/database/types'
import { formatDayString } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    studyAgreementCounterpartyLabels,
    studyAgreementDisplayTitle,
    type OrgStudyAgreementSort,
} from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { ErrorAlert } from '@/components/errors'
import { LegalPanel } from '@/components/legal/legal-panel'
import { PdfLink } from '@/components/legal/pdf-link'
import { Stack, Text } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useState } from 'react'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

const SORTABLE_COLUMNS = ['studyId', 'studyTitle', 'signedAt'] as const

const DEFAULT_SORT: OrgStudyAgreementSort = { columnAccessor: 'signedAt', direction: 'desc' }

const EMPTY_ROWS: StudyAgreement[] = []

// The counterparty column is unsortable: it names the same org on most rows.
const agreementColumns = (counterpartyLabel: string): DataTableColumn<StudyAgreement>[] => [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    { accessor: 'studyTitle', title: 'Study title', sortable: true, render: studyAgreementDisplayTitle },
    { accessor: 'counterpartyName', title: counterpartyLabel },
    {
        accessor: 'signedAt',
        title: 'Effective on',
        sortable: true,
        render: (agreement) => formatDayString(agreement.signedAt),
    },
    { accessor: 'downloadUrl', title: 'View', render: (agreement) => <PdfLink url={agreement.downloadUrl} /> },
]

const EmptyState: FC = () => (
    <Stack gap={4} align="center" py="xl">
        <Text>No Study Agreement yet.</Text>
        <Text c="dimmed">Once a study reaches the agreement stage, its Study Agreement will appear here.</Text>
    </Stack>
)

const useOrgStudyAgreements = (orgSlug: string) => {
    const [sort, setSort] = useState<OrgStudyAgreementSort>(DEFAULT_SORT)
    const {
        data: records = EMPTY_ROWS,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.orgStudyAgreements(orgSlug, sort),
        queryFn: () => fetchOrgStudyAgreementsAction({ orgSlug, sort }),
        // Rows hold still through a re-sort, so the table never flashes its empty state mid-click.
        placeholderData: keepPreviousData,
    })

    // mantine-datatable widens columnAccessor to string, so an unsortable column would otherwise
    // reach the server as a bad param.
    const onSortStatusChange = ({ columnAccessor, direction }: DataTableSortStatus<StudyAgreement>) => {
        const accessor = SORTABLE_COLUMNS.find((column) => column === columnAccessor)
        if (accessor) setSort({ columnAccessor: accessor, direction })
    }

    return { records, isLoading, isError, error, sort, onSortStatusChange }
}

// A refused read must not fall through to the table, where it looks like an org with no
// agreements yet.
const StudyAgreementsTable: FC<{ orgSlug: string; counterpartyLabel: string }> = ({ orgSlug, counterpartyLabel }) => {
    const { records, isLoading, isError, error, sort, onSortStatusChange } = useOrgStudyAgreements(orgSlug)

    if (isError) return <ErrorAlert error={error} />

    return (
        <DataTable
            withTableBorder
            horizontalSpacing="md"
            verticalSpacing="sm"
            fetching={isLoading}
            idAccessor="studyId"
            emptyState={<EmptyState />}
            records={records}
            columns={agreementColumns(counterpartyLabel)}
            sortStatus={sort}
            onSortStatusChange={onSortStatusChange}
        />
    )
}

export const OrgStudyAgreements: FC<{ orgSlug: string; orgType: OrgType }> = ({ orgSlug, orgType }) => (
    <LegalPanel title={legalDocumentTypeLabels.SLA}>
        <StudyAgreementsTable orgSlug={orgSlug} counterpartyLabel={studyAgreementCounterpartyLabels[orgType]} />
    </LegalPanel>
)
