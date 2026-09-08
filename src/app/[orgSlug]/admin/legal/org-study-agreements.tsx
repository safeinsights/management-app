'use client'

import type { FC } from '@/common'
import type { OrgType } from '@/database/types'
import { formatDayString } from '@/lib/dates'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentCollectionLabels,
    legalDocumentQueryKeys,
    studyAgreementCounterpartyLabels,
    studyAgreementDisplayTitle,
    type OrgStudyAgreementSort,
} from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/legal-document.actions'
import { AgreementsPanel } from '@/components/legal/agreements-table'
import { LegalDocumentPdfLink } from '@/components/legal/pdf-link'
import { Stack, Text } from '@mantine/core'
import type { DataTableColumn } from 'mantine-datatable'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

const SORTABLE_COLUMNS = ['studyId', 'studyTitle', 'signedAt'] as const

const DEFAULT_SORT: OrgStudyAgreementSort = { columnAccessor: 'signedAt', direction: 'desc' }

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
    {
        accessor: 'versionId',
        title: 'View',
        render: (agreement) => <LegalDocumentPdfLink versionId={agreement.versionId} />,
    },
]

// This table lists the org's studies, not one reader's acknowledgements.
const NoAgreementsYet: FC = () => (
    <Stack gap={4} align="center">
        <Text>No Study Agreement yet.</Text>
        <Text c="dimmed">Once a study reaches the agreement stage, its Study Agreement will appear here.</Text>
    </Stack>
)

export const OrgStudyAgreements: FC<{ orgSlug: string; orgType: OrgType }> = ({ orgSlug, orgType }) => {
    const columns = agreementColumns(studyAgreementCounterpartyLabels[orgType])

    return (
        <AgreementsPanel
            label={legalDocumentCollectionLabels.SLA}
            idAccessor="studyId"
            columns={columns}
            sortableColumns={SORTABLE_COLUMNS}
            defaultSort={DEFAULT_SORT}
            queryKey={(sort) => legalDocumentQueryKeys.orgStudyAgreements(orgSlug, sort)}
            queryFn={(sort) => fetchOrgStudyAgreementsAction({ orgSlug, sort })}
            emptyState={<NoAgreementsYet />}
        />
    )
}
