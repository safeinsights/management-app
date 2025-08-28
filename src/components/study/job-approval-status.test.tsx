import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import dayjs from 'dayjs'
import type { LatestJobForStudy } from '@/server/db/queries'
import { StudyJobStatus } from '@/database/types'
import { CodeApprovalStatus, FileApprovalStatus } from '@/components/study/job-approval-status'

describe('JobApprovalStatus', () => {
    const baseJob: LatestJobForStudy = {
        id: 'test-id',
        studyId: 'study-1',
        orgId: 'org-1',
        language: 'R',
        createdAt: new Date('2024-03-03T00:00:00Z'),
        statusChanges: [],
        files: [],
    }

    it('shows approved status for CODE-APPROVED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'CODE-APPROVED' as StudyJobStatus, createdAt: '2024-03-03T00:00:00Z' }],
        }
        renderWithProviders(<CodeApprovalStatus job={job} />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected status for CODE-REJECTED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'CODE-REJECTED' as StudyJobStatus, createdAt: '2024-04-04T00:00:00Z' }],
        }
        renderWithProviders(<CodeApprovalStatus job={job} />)
        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows approved status for FILES-APPROVED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'FILES-APPROVED' as StudyJobStatus, createdAt: '2024-03-03T00:00:00Z' }],
        }
        renderWithProviders(<FileApprovalStatus job={job} orgSlug="test-org" />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected status for FILES-REJECTED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'FILES-REJECTED' as StudyJobStatus, createdAt: '2024-04-04T00:00:00Z' }],
        }
        renderWithProviders(<FileApprovalStatus job={job} orgSlug="test-org" />)
        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('renders nothing for disallowed status or missing date', () => {
        const runningJob = {
            ...baseJob,
            statusChanges: [{ status: 'JOB-RUNNING' as StudyJobStatus, createdAt: new Date().toISOString() }],
        }
        renderWithProviders(<FileApprovalStatus job={runningJob} orgSlug="test-org" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        const initiatedJob = {
            ...baseJob,
            statusChanges: [{ status: 'INITIATED' as StudyJobStatus, createdAt: new Date().toISOString() }],
        }
        renderWithProviders(<FileApprovalStatus job={initiatedJob} orgSlug="test-org" />)

        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        const noStatusJob = {
            ...baseJob,
            statusChanges: [],
        }
        renderWithProviders(<FileApprovalStatus job={noStatusJob} orgSlug="test-org" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })
})
