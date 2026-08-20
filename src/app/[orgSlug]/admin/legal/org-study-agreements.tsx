'use client'

import { useQuery, type FC } from '@/common'
import type { OrgType } from '@/database/types'
import { EMPTY_CELL, formatDayString } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    studyAgreementCounterpartyLabels,
    studyAgreementDisplayTitle,
} from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { ErrorAlert } from '@/components/errors'
import { LinkWithIcon } from '@/components/links'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useMemo, useState } from 'react'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

// The action returns rows unordered, so this alone decides what an admin sees first.
const DEFAULT_SORT: DataTableSortStatus<StudyAgreement> = { columnAccessor: 'signedAt', direction: 'desc' }

// Stable identity so the sort memo is not invalidated on every render while the query is loading.
const EMPTY_ROWS: StudyAgreement[] = []

const AgreementLink: FC<{ agreement: StudyAgreement }> = ({ agreement }) => {
    if (!agreement.downloadUrl) return <Text c="dimmed">{EMPTY_CELL}</Text>

    return (
        <LinkWithIcon
            href={agreement.downloadUrl}
            target="_blank"
            rel="noreferrer"
            icon={<ArrowSquareOutIcon size={14} />}
        >
            PDF
        </LinkWithIcon>
    )
}

// The counterparty column is unsortable: it names the same org on most rows, so ordering by it
// says nothing.
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
    { accessor: 'downloadUrl', title: 'View', render: (agreement) => <AgreementLink agreement={agreement} /> },
]

// One value per sortable column, so the sort orders rows by exactly what the column displays.
const sortValues: Record<string, (row: StudyAgreement) => string> = {
    studyId: (row) => row.studyId,
    studyTitle: studyAgreementDisplayTitle,
    signedAt: (row) => row.signedAt ?? '',
}

// Unsigned studies stay at the bottom whichever way the column is pointed: sorting by a date asks
// for the rows that have one. signedAt is YYYY-MM-DD, so it sorts chronologically as text.
const sortAgreements = (rows: StudyAgreement[], { columnAccessor, direction }: DataTableSortStatus<StudyAgreement>) => {
    const flip = direction === 'asc' ? 1 : -1
    const valueOf = sortValues[columnAccessor as string] ?? (() => '')

    return [...rows].sort((a, b) => {
        if (columnAccessor === 'signedAt' && (!a.signedAt || !b.signedAt)) {
            // Only separates signed from unsigned. Two unsigned rows fall through to the title,
            // since returning 0 would leave them in whatever order the planner produced.
            const bySignedPresence = Number(Boolean(b.signedAt)) - Number(Boolean(a.signedAt))
            if (bySignedPresence !== 0) return bySignedPresence
        } else {
            const byColumn = valueOf(a).localeCompare(valueOf(b)) * flip
            if (byColumn !== 0) return byColumn
        }
        return studyAgreementDisplayTitle(a).localeCompare(studyAgreementDisplayTitle(b))
    })
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

    const records = useMemo(() => sortAgreements(agreements, sortStatus), [agreements, sortStatus])

    return { records, isLoading, isError, error, sortStatus, setSortStatus }
}

// A refused read must not fall through to the table, where it is indistinguishable from an org with
// no agreements yet.
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
    <Paper shadow="xs" p="xl">
        <Title order={3} mb="lg">
            Study Agreement
        </Title>
        <StudyAgreementsTable orgSlug={orgSlug} counterpartyLabel={studyAgreementCounterpartyLabels[orgType]} />
    </Paper>
)
