'use client'

import { useQuery, type FC } from '@/common'
import type { OrgType } from '@/database/types'
import { formatDayString } from '@/lib/dates'
import { sortAgreements, type SortValues } from '@/lib/sort-agreements'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    studyAgreementCounterpartyLabels,
    studyAgreementDisplayTitle,
} from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { ErrorAlert } from '@/components/errors'
import { LegalPanel } from '@/components/legal/legal-panel'
import { PdfLink } from '@/components/legal/pdf-link'
import { Stack, Text } from '@mantine/core'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useMemo, useState } from 'react'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

// The action returns rows unordered, so this decides what an admin sees first.
const DEFAULT_SORT: DataTableSortStatus<StudyAgreement> = { columnAccessor: 'signedAt', direction: 'desc' }

// Stable identity so the sort memo survives renders while the query is loading.
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

const sortValues: SortValues<StudyAgreement> = {
    studyId: (row) => row.studyId,
    studyTitle: studyAgreementDisplayTitle,
    signedAt: (row) => row.signedAt ?? '',
}

const EmptyState: FC = () => (
    <Stack gap={4} align="center" py="xl">
        <Text>No Study Agreement yet.</Text>
        <Text c="dimmed">Once a study reaches the agreement stage, its Study Agreement will appear here.</Text>
    </Stack>
)

const useOrgStudyAgreements = (orgSlug: string) => {
    const {
        data: agreements = EMPTY_ROWS,
        isLoading,
        isError,
        error,
    } = useQuery({
        queryKey: legalDocumentQueryKeys.orgStudyAgreements(orgSlug),
        queryFn: () => fetchOrgStudyAgreementsAction({ orgSlug }),
    })
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<StudyAgreement>>(DEFAULT_SORT)

    const records = useMemo(
        () =>
            sortAgreements(agreements, sortStatus, {
                sortValues,
                tieBreakBy: 'studyTitle',
                sinkEmpty: sortStatus.columnAccessor === 'signedAt' ? (row) => row.signedAt ?? '' : undefined,
            }),
        [agreements, sortStatus],
    )

    return { records, isLoading, isError, error, sortStatus, setSortStatus }
}

// A refused read must not fall through to the table, where it looks like an org with no
// agreements yet.
const StudyAgreementsTable: FC<{ orgSlug: string; counterpartyLabel: string }> = ({ orgSlug, counterpartyLabel }) => {
    const { records, isLoading, isError, error, sortStatus, setSortStatus } = useOrgStudyAgreements(orgSlug)

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
            sortStatus={sortStatus}
            onSortStatusChange={setSortStatus}
        />
    )
}

export const OrgStudyAgreements: FC<{ orgSlug: string; orgType: OrgType }> = ({ orgSlug, orgType }) => (
    <LegalPanel title={legalDocumentTypeLabels.SLA}>
        <StudyAgreementsTable orgSlug={orgSlug} counterpartyLabel={studyAgreementCounterpartyLabels[orgType]} />
    </LegalPanel>
)
