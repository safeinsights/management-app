'use client'

import type { FC } from '@/common'
import type { OrgType } from '@/database/types'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentCollectionLabels,
    legalDocumentQueryKeys,
    studyAgreementCounterpartyLabels,
    type OrgStudyAgreementSort,
} from '@/schema/legal-document'
import { fetchOrgStudyAgreementsAction } from '@/server/actions/org-legal.actions'
import {
    ackedAtColumn,
    AgreementsPanel,
    signedAtColumn,
    studyTitleColumn,
    versionColumn,
} from '@/components/legal/agreements-table'
import { testStudyDateCell } from '@/components/study/test-study-label'
import { Routes } from '@/lib/routes'
import { Stack, Text } from '@mantine/core'
import type { DataTableColumn } from 'mantine-datatable'

type StudyAgreement = ActionSuccessType<typeof fetchOrgStudyAgreementsAction>[number]

const SORTING = {
    sortableColumns: ['studyId', 'studyTitle'] as const,
    // Study ids are v7 uuids, so descending puts the newest study first.
    defaultSort: { columnAccessor: 'studyId', direction: 'desc' } satisfies OrgStudyAgreementSort,
}

const studyRoutes: Record<OrgType, typeof Routes.studyView> = { lab: Routes.studyView, enclave: Routes.studyReview }

// The counterparty column is unsortable: it names the same org on most rows.
const agreementColumns = (orgSlug: string, orgType: OrgType): DataTableColumn<StudyAgreement>[] => [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    studyTitleColumn<StudyAgreement>(({ studyId }) => studyRoutes[orgType]({ orgSlug, studyId })),
    { accessor: 'counterpartyName', title: studyAgreementCounterpartyLabels[orgType] },
    signedAtColumn<StudyAgreement>(testStudyDateCell),
    ackedAtColumn<StudyAgreement>(testStudyDateCell),
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
            label={legalDocumentCollectionLabels.SLA}
            idAccessor="studyId"
            columns={columns}
            sorting={SORTING}
            queryKey={(sort) => legalDocumentQueryKeys.orgStudyAgreements(orgSlug, sort)}
            queryFn={(sort) => fetchOrgStudyAgreementsAction({ orgSlug, sort })}
            emptyState={<NoAgreementsYet />}
        />
    )
}
