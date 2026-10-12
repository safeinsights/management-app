import type { Story } from '@ladle/react'
import { Routes } from '@/lib/routes'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { getColumns } from './columns'
import { buildRowModel } from './row-model'
import { DEFAULT_SORT } from './sort'
import { StudiesTableView } from './studies-table-view'
import type { Audience, Scope, StudyRow as StudyRowType } from './types'

const meta = { title: 'Pages / Dashboard', argTypes: pageBackgroundArgTypes }
export default meta

const study = (o: Partial<StudyRowType> = {}): StudyRowType => ({
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Reading comprehension cohort analysis',
    status: 'PENDING-REVIEW',
    createdAt: new Date('2026-05-18'),
    submittedAt: new Date('2026-05-19'),
    lastUpdatedAt: new Date('2026-05-21'),
    reviewerName: null,
    researcherId: 'user-1',
    reviewerId: null,
    createdBy: 'Ada Lovelace',
    jobStatusChanges: [],
    researcherAgreementsAckedAt: null,
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
    orgName: 'Mars University',
    orgSlug: 'mars-university',
    reviewingEnclaveName: 'Mars University Data Partner',
    submittingLabName: 'Kinetic Lab',
    submittedByOrgSlug: 'kinetic-lab',
    ...o,
})

// Session-free: no user id, so no draft bin; the real container passes the signed-in user.
const table = (studies: StudyRowType[], audience: Audience, scope: Scope) => ({
    rows: studies.map((s) => buildRowModel(s, audience, { orgSlug: 'mars-university' })),
    columns: getColumns(audience, scope, false),
    sort: DEFAULT_SORT,
    onSort: () => undefined,
    audience,
})

export const ResearchLabWithStudies: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            {...table(
                [
                    study({ id: '00000000-0000-4000-8000-000000000001', title: 'Foo', status: 'DRAFT' }),
                    study({ id: '00000000-0000-4000-8000-000000000002', title: 'JP New Study' }),
                    study({
                        id: '00000000-0000-4000-8000-000000000003',
                        title: 'Results ready study',
                        status: 'APPROVED',
                        jobStatusChanges: [{ status: 'CODE-APPROVED' }, { status: 'FILES-APPROVED' }],
                    }),
                ],
                'researcher',
                'org',
            )}
            title="All studies"
            description="Track every study your organization has created, from draft to completed. Open a study to check its status, view details, or take your next step."
            showDescription
            newStudyHref={Routes.studyRequest({ orgSlug: 'kinetic-lab' })}
            paperWrapper
        />
    </div>
)

export const ResearchLabEmpty: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            {...table([], 'researcher', 'org')}
            title="All studies"
            newStudyHref={Routes.studyRequest({ orgSlug: 'kinetic-lab' })}
            paperWrapper
        />
    </div>
)

export const DataPartnerWithStudies: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            {...table(
                [
                    study({ id: '00000000-0000-4000-8000-000000000011', title: 'Needs review proposal' }),
                    study({
                        id: '00000000-0000-4000-8000-000000000012',
                        title: 'Approved proposal',
                        status: 'APPROVED',
                    }),
                    study({
                        id: '00000000-0000-4000-8000-000000000013',
                        title: 'Errored job',
                        status: 'APPROVED',
                        jobStatusChanges: [{ status: 'JOB-ERRORED' }],
                    }),
                ],
                'reviewer',
                'org',
            )}
            title="Studies for review"
            description="Track and review studies submitted to your organization. Open a study to view its details, review submitted materials, and submit your decision."
            showDescription
            paperWrapper
        />
    </div>
)

export const DataPartnerEmpty: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView {...table([], 'reviewer', 'org')} title="Studies for review" paperWrapper />
    </div>
)

export const LoadError: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            {...table([], 'reviewer', 'org')}
            title="Studies for review"
            isError
            errorMessage="boom"
            paperWrapper
        />
    </div>
)
