import type { StudyJobStatus } from '@/database/types'
import { renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { Table, TableTbody } from '@mantine/core'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyRow } from './study-row'
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

function renderRow(study: StudyRowType, audience: Audience = 'reviewer') {
    return renderWithProviders(
        <Table>
            <TableTbody>
                <StudyRow study={study} audience={audience} scope="org" orgSlug="test-org" />
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

        expect(await screen.findByText('Waiting for Genius to submit their code.')).toBeVisible()
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

const rowEl = () => screen.getByText('Reading Comprehension Study').closest('tr') as HTMLElement
const isHighlighted = (tr: HTMLElement) => tr.style.backgroundColor !== '' || tr.style.fontWeight === '600'

describe('StudyRow reviewer highlight', () => {
    it('highlights when the proposal is awaiting review (PENDING-REVIEW)', () => {
        renderRow({ ...baseStudy, status: 'PENDING-REVIEW', jobStatusChanges: [] })
        expect(isHighlighted(rowEl())).toBe(true)
    })

    // A resubmission opens a new job, and the dashboard query returns only the latest job's
    // statuses, so the prior round's decision is absent (OTTER-552).
    it('highlights when code is awaiting review even though study is APPROVED', () => {
        renderRow({
            ...baseStudy,
            status: 'APPROVED',
            jobStatusChanges: [
                { status: 'CODE-SCANNED' as StudyJobStatus },
                { status: 'CODE-SUBMITTED' as StudyJobStatus },
            ],
        })
        expect(isHighlighted(rowEl())).toBe(true)
    })

    it('does not highlight when the latest code decision is a change request (awaiting researcher)', () => {
        renderRow({
            ...baseStudy,
            status: 'APPROVED',
            jobStatusChanges: [
                { status: 'CODE-CHANGES-REQUESTED' as StudyJobStatus },
                { status: 'CODE-SCANNED' as StudyJobStatus },
                { status: 'CODE-SUBMITTED' as StudyJobStatus },
            ],
        })
        expect(isHighlighted(rowEl())).toBe(false)
    })

    it('does not highlight an approved-and-running study', () => {
        renderRow({
            ...baseStudy,
            status: 'APPROVED',
            jobStatusChanges: [
                { status: 'JOB-RUNNING' as StudyJobStatus },
                { status: 'CODE-APPROVED' as StudyJobStatus },
                { status: 'CODE-SUBMITTED' as StudyJobStatus },
            ],
        })
        expect(isHighlighted(rowEl())).toBe(false)
    })
})
