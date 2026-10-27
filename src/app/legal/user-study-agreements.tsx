'use client'

import type { FC } from '@/common'
import type { ActionSuccessType } from '@/lib/types'
import {
    legalDocumentQueryKeys,
    legalDocumentCollectionLabels,
    type UserStudyAgreementSort,
} from '@/schema/legal-document'
import { fetchUserStudyAgreementsAction } from '@/server/actions/user-legal.actions'
import type { DataTableColumn } from 'mantine-datatable'
import { agreementDateColumns, AgreementsPanel, studyTitleColumn } from '@/components/legal/agreements-table'
import { testStudyDateCell } from '@/components/study/test-study-label'
import { Routes } from '@/lib/routes'

type StudyAgreement = ActionSuccessType<typeof fetchUserStudyAgreementsAction>[number]

const studyHref = ({ isResearcher, fromOrgSlug, toOrgSlug, studyId }: StudyAgreement) =>
    isResearcher
        ? Routes.studyView({ orgSlug: fromOrgSlug, studyId })
        : Routes.studyReview({ orgSlug: toOrgSlug, studyId })

// Raw uuid: no short display id exists, and truncating would show something that matches nothing.
const columns: DataTableColumn<StudyAgreement>[] = [
    { accessor: 'studyId', title: 'Study ID', sortable: true },
    studyTitleColumn<StudyAgreement>(studyHref),
    { accessor: 'fromName', title: 'From' },
    { accessor: 'toName', title: 'To' },
    ...agreementDateColumns<StudyAgreement>(testStudyDateCell),
]

const SORTING = {
    sortableColumns: ['studyId', 'studyTitle'] as const,
    // Study ids are v7 uuids, so descending puts the newest study first.
    defaultSort: { columnAccessor: 'studyId', direction: 'desc' } satisfies UserStudyAgreementSort,
}

export const UserStudyAgreements: FC = () => (
    <AgreementsPanel
        label={legalDocumentCollectionLabels.SLA}
        idAccessor="studyId"
        columns={columns}
        sorting={SORTING}
        queryKey={legalDocumentQueryKeys.userStudyAgreements}
        queryFn={(sort) => fetchUserStudyAgreementsAction({ sort })}
    />
)
