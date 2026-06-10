import type { Story } from '@ladle/react'
import { Anchor } from '@mantine/core'
import { Routes } from '@/lib/routes'
import { useStudyStatus } from '@/hooks/use-study-status'
import { pageBackgroundArgTypes } from '../../../../.ladle/backgrounds'
import { StudiesTableView } from './studies-table-view'
import { StudyRowView } from './study-row-view'
import type { Audience, Scope, StudyRow as StudyRowType } from './types'

// The dashboard page-view (pattern-setter for page-level stories). StudiesTableView is
// presentational; rows are supplied via renderRow. Here renderRow builds a session-free
// StudyRowView with a plain "View" link (the real container injects the StudyActionLink).
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
    orgName: 'Mars University',
    orgSlug: 'mars-university',
    reviewingEnclaveName: 'Mars University Data Org',
    ...o,
})

function StoryRow({ study: s, audience, scope }: { study: StudyRowType; audience: Audience; scope: Scope }) {
    const status = useStudyStatus({ studyStatus: s.status, audience, jobStatusChanges: s.jobStatusChanges })
    const isHighlighted =
        audience === 'researcher'
            ? s.jobStatusChanges.some((c) => c.status === 'FILES-APPROVED')
            : s.status === 'PENDING-REVIEW'
    return (
        <StudyRowView
            study={s}
            audience={audience}
            scope={scope}
            status={status}
            isHighlighted={isHighlighted}
            actionLink={
                <Anchor href="#" fz="sm">
                    View
                </Anchor>
            }
        />
    )
}

export const ResearcherWithStudies: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            studies={[
                study({ id: 'a1', title: 'Foo', status: 'DRAFT' }),
                study({ id: 'a2', title: 'JP New Study', status: 'PENDING-REVIEW' }),
                study({
                    id: 'a3',
                    title: 'Results ready study',
                    status: 'APPROVED',
                    jobStatusChanges: [{ status: 'CODE-APPROVED' }, { status: 'FILES-APPROVED' }],
                }),
            ]}
            audience="researcher"
            scope="user"
            title="Studies"
            newStudyHref={Routes.studyRequest({ orgSlug: 'mars-university-lab' })}
            renderRow={(s) => <StoryRow key={s.id} study={s} audience="researcher" scope="user" />}
            paperWrapper
        />
    </div>
)

export const ResearcherEmpty: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            studies={[]}
            audience="researcher"
            scope="user"
            title="Studies"
            newStudyHref={Routes.studyRequest({ orgSlug: 'mars-university-lab' })}
            renderRow={(s) => <StoryRow key={s.id} study={s} audience="researcher" scope="user" />}
            paperWrapper
        />
    </div>
)

export const ReviewerWorklist: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            studies={[
                study({ id: 'b1', title: 'Needs review proposal', status: 'PENDING-REVIEW' }),
                study({ id: 'b2', title: 'Approved proposal', status: 'APPROVED', reviewerName: 'Grace Hopper' }),
                study({
                    id: 'b3',
                    title: 'Errored job',
                    status: 'APPROVED',
                    jobStatusChanges: [{ status: 'JOB-ERRORED' }],
                }),
            ]}
            audience="reviewer"
            scope="org"
            title="Studies to Review"
            description="Review all the studies submitted to your organization. Studies that need your attention are labeled Needs review."
            renderRow={(s) => <StoryRow key={s.id} study={s} audience="reviewer" scope="org" />}
            paperWrapper
        />
    </div>
)

export const LoadError: Story = () => (
    <div style={{ padding: 24 }}>
        <StudiesTableView
            studies={[]}
            audience="reviewer"
            scope="org"
            title="Studies to Review"
            isError
            errorMessage="boom"
            renderRow={(s) => <StoryRow key={s.id} study={s} audience="reviewer" scope="org" />}
            paperWrapper
        />
    </div>
)
