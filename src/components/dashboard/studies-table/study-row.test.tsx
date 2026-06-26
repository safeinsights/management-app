import type { StudyJobStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { Table, TableTbody } from '@mantine/core'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StudyRow } from './study-row'
import type { StudyRow as StudyRowType } from './types'

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
    orgName: 'Test Org',
    orgSlug: 'test-org',
}

function renderRow(study: StudyRowType) {
    return renderWithProviders(
        <Table>
            <TableTbody>
                <StudyRow study={study} audience="reviewer" scope="org" orgSlug="test-org" />
            </TableTbody>
        </Table>,
    )
}

const rowEl = () => screen.getByText('Reading Comprehension Study').closest('tr') as HTMLElement
const isHighlighted = (tr: HTMLElement) => tr.style.backgroundColor !== '' || tr.style.fontWeight === '600'

describe('StudyRow reviewer highlight', () => {
    it('highlights when the proposal is awaiting review (PENDING-REVIEW)', () => {
        renderRow({ ...baseStudy, status: 'PENDING-REVIEW', jobStatusChanges: [] })
        expect(isHighlighted(rowEl())).toBe(true)
    })

    // OTTER-552: a code resubmission opens a NEW job; the dashboard query returns only the latest
    // job's statuses, so a resubmitted study's latest job carries CODE-SUBMITTED (then CODE-SCANNED),
    // NOT the prior round's decision. That still flags the reviewer (code awaiting review).
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
