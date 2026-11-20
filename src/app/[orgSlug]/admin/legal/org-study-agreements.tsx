'use client'

import type { FC } from '@/common'
import type { OrgType } from '@/database/types'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentTypeLabels,
    studyAgreementCounterpartyLabels,
    type OrgStudyAgreementSort,
} from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/org-legal.actions'
import {
    AgreementsPanel,
    clampedColumn,
    signedAtColumn,
    studyTitleColumn,
    TruncatedNameCell,
    versionColumn,
} from '@/components/legal/agreements-table'
import { testStudyDateCell } from '@/components/study/test-study-label'
import { Routes } from '@/lib/routes'
import { Stack, Text } from '@mantine/core'
import type { DataTableColumn } from 'mantine-datatable'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

const SORTING = {
    sortableColumns: ['studyId', 'studyTitle', 'signedAt'] as const,
    // Study ids are v7 uuids, so descending puts the newest study first.
    defaultSort: { columnAccessor: 'studyId', direction: 'desc' } satisfies OrgStudyAgreementSort,
}

const studyRoutes: Record<OrgType, typeof Routes.studyView> = { lab: Routes.studyView, enclave: Routes.studyReview }

// "Test study" wins over "Not ready": a test study needs no agreement, so it is not waiting on one.
const effectiveOnExemption = (row: StudyAgreement) => testStudyDateCell(row) ?? (row.signedAt ? null : 'Not ready')

// The counterparty column is unsortable: it names the same org on most rows.
const agreementColumns = (orgSlug: string, orgType: OrgType): DataTableColumn<StudyAgreement>[] => [
    clampedColumn(
        '30%',
        {
            accessor: 'studyId',
            title: 'Study ID',
            sortable: true,
            render: ({ studyId }) => <TruncatedNameCell name={studyId} />,
        },
        { minWidth: 160 },
    ),
    studyTitleColumn<StudyAgreement>(({ studyId }) => studyRoutes[orgType]({ orgSlug, studyId })),
    { accessor: 'counterpartyName', title: studyAgreementCounterpartyLabels[orgType] },
    { ...signedAtColumn<StudyAgreement>(effectiveOnExemption), sortable: true },
    versionColumn<StudyAgreement>(),
]

// This table lists the org's studies, not one reader's acknowledgements.
const NoAgreementsYet: FC = () => (
    <Stack gap="xxs" align="center">
        <Text>No Study Agreement yet.</Text>
        <Text c="dimmed">Once a study reaches the agreement stage, its Study Agreement will appear here.</Text>
    </Stack>
)

export const OrgStudyAgreements: FC<{ orgSlug: string; orgType: OrgType }> = ({ orgSlug, orgType }) => {
    const columns = agreementColumns(orgSlug, orgType)

    return (
        <AgreementsPanel
            label={legalDocumentTypeLabels.SLA}
            idAccessor="studyId"
            columns={columns}
            sorting={SORTING}
            queryKey={(sort) => legalDocumentQueryKeys.orgStudyAgreements(orgSlug, sort)}
            queryFn={(sort) => fetchOrgStudyAgreementsAction({ orgSlug, sort })}
            emptyState={<NoAgreementsYet />}
        />
    )
}
