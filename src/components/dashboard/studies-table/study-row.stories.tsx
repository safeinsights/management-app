import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Anchor, Table } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { StudyRowView } from './study-row-view'
import { useStudyStatus } from '@/hooks/use-study-status'
import type { Audience, Scope, StudyRow as StudyRowType } from './types'

// Stories target the presentational StudyRowView (the StudyRow container reads the
// Clerk session via StudyActionLink, which isn't available in isolation). The action
// link is passed in as a plain anchor here.
const meta = { title: 'Tables / Study row', argTypes: pageBackgroundArgTypes }
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
    orgName: 'Mars University',
    orgSlug: 'mars-university',
    reviewingEnclaveName: 'Mars University Data Partner',
    ...o,
})

const link = (
    <Anchor href="#" fz="sm">
        View
    </Anchor>
)

// useStudyStatus is a pure helper; calling it derives a realistic StatusLabel from the
// fixture, mirroring how the StudyRow container computes it.
function Row({
    s,
    audience,
    scope,
    highlighted = false,
}: {
    s: StudyRowType
    audience: Audience
    scope: Scope
    highlighted?: boolean
}) {
    const status = useStudyStatus({ studyStatus: s.status, audience, jobStatusChanges: s.jobStatusChanges })
    return (
        <StudyRowView
            study={s}
            audience={audience}
            scope={scope}
            status={status}
            isHighlighted={highlighted}
            actionLink={link}
        />
    )
}

const Wrap = ({ children }: { children: ReactNode }) => (
    <div style={{ padding: 24 }}>
        <Table>
            <Table.Tbody>{children}</Table.Tbody>
        </Table>
    </div>
)

export const ResearcherRows: Story = () => (
    <Wrap>
        <Row s={study({ title: 'Code draft study', status: 'DRAFT' })} audience="researcher" scope="user" />
        <Row s={study({ title: 'Proposal under review' })} audience="researcher" scope="user" />
        <Row
            s={study({
                title: 'Code approved study',
                status: 'APPROVED',
                jobStatusChanges: [{ status: 'CODE-APPROVED' }],
            })}
            audience="researcher"
            scope="user"
        />
        <Row
            s={study({
                title: 'Results ready study',
                status: 'APPROVED',
                jobStatusChanges: [{ status: 'CODE-APPROVED' }, { status: 'FILES-APPROVED' }],
            })}
            audience="researcher"
            scope="user"
            highlighted
        />
    </Wrap>
)

export const ReviewerRows: Story = () => (
    <Wrap>
        <Row
            s={study({ title: 'Needs review proposal', status: 'PENDING-REVIEW' })}
            audience="reviewer"
            scope="org"
            highlighted
        />
        <Row
            s={study({ title: 'Approved proposal', status: 'APPROVED', reviewerName: 'Grace Hopper' })}
            audience="reviewer"
            scope="org"
        />
        <Row
            s={study({ title: 'Errored job', status: 'APPROVED', jobStatusChanges: [{ status: 'JOB-ERRORED' }] })}
            audience="reviewer"
            scope="org"
        />
    </Wrap>
)
