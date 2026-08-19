'use client'

import { useQuery, type FC } from '@/common'
import type { OrgType } from '@/database/types'
import { formatDayString } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import { legalDocumentQueryKeys, studyAgreementCounterpartyLabels } from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { Anchor, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/ssr'
import { DataTable, type DataTableColumn, type DataTableSortStatus } from 'mantine-datatable'
import { useMemo, useState } from 'react'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

// The row's own text for a column that has no value yet. A study listed before anything is signed is
// the ordinary case here, not a gap in the data.
const NOT_YET = '—'

const AgreementLink: FC<{ agreement: StudyAgreement }> = ({ agreement }) => {
    if (!agreement.downloadUrl) return <Text c="dimmed">{NOT_YET}</Text>

    return (
        <Anchor href={agreement.downloadUrl} target="_blank" rel="noreferrer">
            PDF <ArrowSquareOutIcon size={14} />
        </Anchor>
    )
}

// Built here rather than inline in the JSX. The counterparty column is unsortable by design: it
// names one org over and over on most pages, so ordering by it says nothing.
const agreementColumns = (counterpartyLabel: string): DataTableColumn<StudyAgreement>[] => [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    // study.title is nullable, and the id is what the study is displayed under when it is.
    {
        accessor: 'studyTitle',
        title: 'Study title',
        sortable: true,
        render: (agreement) => agreement.studyTitle || agreement.studyId,
    },
    { accessor: 'counterpartyName', title: counterpartyLabel },
    {
        accessor: 'signedAt',
        title: 'Effective on',
        sortable: true,
        render: (agreement) => formatDayString(agreement.signedAt),
    },
    { accessor: 'downloadUrl', title: 'View', render: (agreement) => <AgreementLink agreement={agreement} /> },
]

// Studies still waiting on an agreement stay at the bottom whichever way the column is pointed:
// sorting by a date asks for the rows that have one. Everything else is a plain string compare, and
// signedAt is a YYYY-MM-DD string so it sorts chronologically as text.
const sortAgreements = (rows: StudyAgreement[], { columnAccessor, direction }: DataTableSortStatus<StudyAgreement>) => {
    const flip = direction === 'asc' ? 1 : -1
    const key = columnAccessor as 'studyId' | 'studyTitle' | 'signedAt'

    return [...rows].sort((a, b) => {
        if (key === 'signedAt' && (!a.signedAt || !b.signedAt)) {
            return Number(Boolean(b.signedAt)) - Number(Boolean(a.signedAt))
        }
        const left = key === 'studyTitle' ? a.studyTitle || a.studyId : (a[key] ?? '')
        const right = key === 'studyTitle' ? b.studyTitle || b.studyId : (b[key] ?? '')
        return left.localeCompare(right) * flip
    })
}

const EmptyState: FC = () => (
    <Stack gap={4} align="center" py="xl">
        <Text>No Study Agreement yet.</Text>
        <Text c="dimmed">Once a study reaches the agreement stage, its Study Agreement will appear here.</Text>
    </Stack>
)

export const OrgStudyAgreements: FC<{ orgSlug: string; orgType: OrgType }> = ({ orgSlug, orgType }) => {
    const { data: agreements = [], isLoading } = useQuery({
        queryKey: legalDocumentQueryKeys.orgStudyAgreements(orgSlug),
        queryFn: () => fetchOrgStudyAgreementsAction({ orgSlug }),
    })
    // The action already returns effective-date-descending, so this only takes over once the admin
    // picks a column.
    const [sortStatus, setSortStatus] = useState<DataTableSortStatus<StudyAgreement> | null>(null)

    const records = useMemo(
        () => (sortStatus ? sortAgreements(agreements, sortStatus) : agreements),
        [agreements, sortStatus],
    )
    const columns = agreementColumns(studyAgreementCounterpartyLabels[orgType])

    return (
        <Paper shadow="xs" p="xl">
            <Title order={3} mb="lg">
                Study Agreement
            </Title>
            <DataTable
                withTableBorder
                horizontalSpacing="md"
                verticalSpacing="sm"
                fetching={isLoading}
                idAccessor="studyId"
                emptyState={<EmptyState />}
                records={records}
                columns={columns}
                sortStatus={sortStatus ?? { columnAccessor: 'signedAt', direction: 'desc' }}
                onSortStatusChange={setSortStatus}
            />
        </Paper>
    )
}
