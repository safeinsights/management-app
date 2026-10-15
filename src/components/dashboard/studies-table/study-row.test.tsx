import type { StudyJobStatus } from '@/database/types'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { Table, TableTbody } from '@mantine/core'
import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Routes } from '@/lib/routes'
import { getColumns } from './columns'
import { DeleteDraftButton } from './delete-draft-button'
import { buildRowModel } from './row-model'
import { StudyRowView } from './study-row-view'
import type { Audience, StudyRow as StudyRowType } from './types'

const baseStudy: StudyRowType = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Reading Comprehension Study',
    status: 'APPROVED',
    createdAt: new Date(),
    submittedAt: new Date(),
    lastUpdatedAt: new Date(),
    reviewerName: 'Reviewer A',
    researcherId: 'researcher-1',
    reviewerId: 'reviewer-1',
    createdBy: 'Person A',
    jobStatusChanges: [],
    researcherAgreementsAckedAt: null,
    piUserId: null,
    datasets: null,
    researchQuestions: null,
    projectSummary: null,
    impact: null,
    additionalNotes: null,
    hasStep2CollabDoc: false,
    orgName: 'Test Org',
    orgSlug: 'test-org',
}

function renderRow(study: StudyRowType, audience: Audience = 'reviewer', userId?: string) {
    return renderWithProviders(
        <Table>
            <TableTbody>
                <StudyRowView
                    row={buildRowModel(study, audience, { orgSlug: 'test-org', userId })}
                    columns={getColumns(audience, 'org', false)}
                    DeleteDraft={DeleteDraftButton}
                />
            </TableTbody>
        </Table>,
    )
}

describe('StudyRow status pill', () => {
    it('tells the reviewer the lab has started but not submitted code, naming the lab', async () => {
        const user = userEvent.setup()
        renderRow({
            ...baseStudy,
            status: 'APPROVED',
            submittingLabName: 'Genius Lab',
            jobStatusChanges: [{ status: 'INITIATED' as StudyJobStatus }],
        })

        await user.hover(screen.getByText('Awaiting code'))

        expect(await screen.findByText('Waiting for Genius Lab to submit their code.')).toBeVisible()
    })

    it('tells the researcher the proposal is with the data partner, naming the partner', async () => {
        const user = userEvent.setup()
        renderRow(
            { ...baseStudy, status: 'PENDING-REVIEW', reviewingEnclaveName: 'Riverside University' },
            'researcher',
        )

        await user.hover(screen.getByText('Proposal submitted'))

        expect(await screen.findByText('Waiting for Riverside University to review proposal.')).toBeVisible()
    })
})

const rowEl = () => screen.getByRole('link', { name: 'Reading Comprehension Study' }).closest('tr') as HTMLElement
const titleCell = () => screen.getByRole('link', { name: 'Reading Comprehension Study' }).closest('td') as HTMLElement

describe('StudyRow unread dot', () => {
    const lastUpdatedAt = new Date('2026-09-10T12:00:00Z')

    it('marks a study the viewer never opened', () => {
        renderRow({ ...baseStudy, lastUpdatedAt, lastOpenedAt: null })
        expect(within(titleCell()).getByText('Updated')).toBeInTheDocument()
    })

    it('marks a study that changed after the last visit', () => {
        renderRow({ ...baseStudy, lastUpdatedAt, lastOpenedAt: new Date('2026-09-09T12:00:00Z') })
        expect(within(titleCell()).getByText('Updated')).toBeInTheDocument()
    })

    it('clears once the viewer has opened the study since it changed', () => {
        renderRow({ ...baseStudy, lastUpdatedAt, lastOpenedAt: new Date('2026-09-11T12:00:00Z') })
        expect(screen.queryByText('Updated')).toBeNull()
        expect(screen.getByRole('link', { name: 'Reading Comprehension Study' })).toBeInTheDocument()
    })

    // The dot replaced the needs-attention row fill: an opened study awaiting review carries none.
    it('does not highlight a read study awaiting review', () => {
        renderRow({ ...baseStudy, status: 'PENDING-REVIEW', lastUpdatedAt, lastOpenedAt: new Date('2026-09-11') })
        expect(rowEl()).not.toHaveAttribute('data-highlighted')
        expect(screen.queryByText('Updated')).toBeNull()
    })
})

describe('StudyRow title', () => {
    // "Back to my studies" always lands on My studies, so an org dashboard entry carries no marker (OTTER-805).
    it('is the only link in the row and opens the study in the same tab', () => {
        renderRow(
            { ...baseStudy, status: 'APPROVED', jobStatusChanges: [{ status: 'CODE-SUBMITTED' as StudyJobStatus }] },
            'researcher',
        )

        const link = screen.getByRole('link', { name: 'Reading Comprehension Study' })
        expect(link).toHaveAttribute('href', Routes.studyView({ orgSlug: 'test-org', studyId: baseStudy.id }))
        expect(link).not.toHaveAttribute('target')
        expect(within(rowEl()).getAllByRole('link')).toHaveLength(1)
    })

    it('shows the full title in a tooltip on hover', async () => {
        const user = userEvent.setup()
        renderRow(baseStudy)

        await user.hover(screen.getByRole('link', { name: 'Reading Comprehension Study' }))

        expect(await screen.findByRole('tooltip')).toHaveTextContent('Reading Comprehension Study')
    })
})

describe('StudyRow attribution', () => {
    it('lists every review stage in the Reviewed by tooltip', async () => {
        const user = userEvent.setup()
        renderRow({
            ...baseStudy,
            proposalReviewerName: 'Aspen Brooke',
            proposalReviewedAt: new Date('2026-09-01'),
            codeReviewerName: 'Jesse Tetris',
            codeReviewedAt: new Date('2026-09-02'),
        })

        await user.hover(screen.getByText('Jesse Tetris'))

        const tooltip = await screen.findByRole('tooltip')
        expect(tooltip).toHaveTextContent('Proposal: Aspen Brooke')
        expect(tooltip).toHaveTextContent('Code: Jesse Tetris')
        expect(tooltip).toHaveTextContent('Outputs: Not reviewed')
    })

    it('shows Not submitted for a draft', () => {
        renderRow({ ...baseStudy, status: 'DRAFT', jobStatusChanges: [] }, 'researcher')
        expect(screen.getAllByText('Not submitted')).toHaveLength(2)
    })
})

describe('StudyRow draft bin', () => {
    const draft = { ...baseStudy, status: 'DRAFT' as const, jobStatusChanges: [] }

    it('shows the bin beside the status for the draft author', () => {
        renderRow(draft, 'researcher', 'researcher-1')
        expect(screen.getByLabelText(/delete draft study/i)).toBeDefined()
    })

    it('hides the bin from other researchers', () => {
        renderRow(draft, 'researcher', 'someone-else')
        expect(screen.queryByLabelText(/delete draft study/i)).toBeNull()
    })

    it('renders no bin when the container passes no delete control', () => {
        renderWithProviders(
            <Table>
                <TableTbody>
                    <StudyRowView
                        row={buildRowModel(draft, 'researcher', { orgSlug: 'test-org', userId: 'researcher-1' })}
                        columns={getColumns('researcher', 'org', false)}
                    />
                </TableTbody>
            </Table>,
        )
        expect(screen.queryByLabelText(/delete draft study/i)).toBeNull()
    })

    it('hides the bin once the study is submitted', () => {
        renderRow({ ...draft, status: 'PENDING-REVIEW' }, 'researcher', 'researcher-1')
        expect(screen.queryByLabelText(/delete draft study/i)).toBeNull()
    })
})
