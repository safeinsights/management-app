import type { Story } from '@ladle/react'
import type { ReactNode } from 'react'
import { Table } from '@mantine/core'
import { pageBackgroundArgTypes } from '~ladle/backgrounds'
import { getColumns } from './columns'
import { buildRowModel } from './row-model'
import { StudyRowView } from './study-row-view'
import type { Audience, Scope, StudyRow as StudyRowType } from './types'

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
    hasStep2CollabDoc: false,
    orgName: 'Mars University',
    orgSlug: 'mars-university',
    reviewingEnclaveName: 'Mars University Data Partner',
    submittingLabName: 'Kinetic Lab',
    submittedByOrgSlug: 'kinetic-lab',
    ...o,
})

function Rows({ studies, audience, scope }: { studies: StudyRowType[]; audience: Audience; scope: Scope }) {
    const columns = getColumns(audience, scope, false)
    return (
        <>
            {studies.map((s) => (
                <StudyRowView
                    key={s.title}
                    row={buildRowModel(s, audience, { orgSlug: 'mars-university' })}
                    columns={columns}
                />
            ))}
        </>
    )
}

const Wrap = ({ children }: { children: ReactNode }) => (
    <div style={{ padding: 24 }}>
        <Table layout="fixed" verticalSpacing="md" horizontalSpacing="md">
            <Table.Tbody>{children}</Table.Tbody>
        </Table>
    </div>
)

export const ResearchLabRows: Story = () => (
    <Wrap>
        <Rows
            audience="researcher"
            scope="org"
            studies={[
                study({ title: 'A draft that has not been submitted yet', status: 'DRAFT' }),
                study({
                    title: 'Proposal under review',
                    proposalAuditName: 'Ada Lovelace',
                    proposalAuditAt: new Date('2026-05-19'),
                }),
                study({
                    title: 'Results ready study with a title long enough to be truncated in its column',
                    status: 'APPROVED',
                    jobStatusChanges: [
                        { status: 'CODE-SUBMITTED' },
                        { status: 'CODE-APPROVED' },
                        { status: 'FILES-APPROVED' },
                    ],
                    codeSubmitterName: 'Grace Hopper',
                    codeSubmittedAt: new Date('2026-05-25'),
                }),
            ]}
        />
    </Wrap>
)

export const DataPartnerRows: Story = () => (
    <Wrap>
        <Rows
            audience="reviewer"
            scope="org"
            studies={[
                study({ title: 'Needs review proposal' }),
                study({
                    title: 'Approved proposal',
                    status: 'APPROVED',
                    proposalReviewerName: 'Aspen Brooke',
                    proposalReviewedAt: new Date('2026-05-20'),
                }),
                study({ title: 'Errored job', status: 'APPROVED', jobStatusChanges: [{ status: 'JOB-ERRORED' }] }),
            ]}
        />
    </Wrap>
)
