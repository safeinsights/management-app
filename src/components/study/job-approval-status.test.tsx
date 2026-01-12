import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen } from '@testing-library/react'
import dayjs from 'dayjs'
import type { LatestJobForStudy } from '@/server/db/queries'
import { StudyJobStatus } from '@/database/types'
import { ApprovalStatus } from '@/components/study/job-approval-status'

describe('ApprovalStatus', () => {
    const baseJob: LatestJobForStudy = {
        id: 'test-id',
        studyId: 'study-1',
        orgId: 'org-1',
        language: 'R',
        baseImageUrl: null,
        createdAt: new Date('2024-03-03T00:00:00Z'),
        statusChanges: [],
        files: [],
    }

    it('shows approved status for CODE-APPROVED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'CODE-APPROVED' as StudyJobStatus, createdAt: '2024-03-03T00:00:00Z' }],
        }
        renderWithProviders(<ApprovalStatus job={job} orgSlug="test-org" type="code" />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows approved status for FILES-APPROVED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'FILES-APPROVED' as StudyJobStatus, createdAt: '2024-03-03T00:00:00Z' }],
        }
        renderWithProviders(<ApprovalStatus job={job} orgSlug="test-org" type="files" />)

        expect(screen.getByText(/Approved/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected status for CODE-REJECTED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'CODE-REJECTED' as StudyJobStatus, createdAt: '2024-04-04T00:00:00Z' }],
        }
        renderWithProviders(<ApprovalStatus job={job} orgSlug="test-org" type="code" />)
        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('shows rejected status for FILES-REJECTED', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'FILES-REJECTED' as StudyJobStatus, createdAt: '2024-04-04T00:00:00Z' }],
        }
        renderWithProviders(<ApprovalStatus job={job} orgSlug="test-org" type="files" />)
        expect(screen.getByText(/Rejected/)).toBeDefined()
        expect(screen.getByText(new RegExp(dayjs(job.statusChanges[0].createdAt).format('MMM DD, YYYY')))).toBeDefined()
    })

    it('renders nothing for code type when only files status exists', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'FILES-APPROVED' as StudyJobStatus, createdAt: '2024-03-03T00:00:00Z' }],
        }
        renderWithProviders(<ApprovalStatus job={job} orgSlug="test-org" type="code" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })

    it('renders nothing for files type when only code status exists', () => {
        const job = {
            ...baseJob,
            statusChanges: [{ status: 'CODE-APPROVED' as StudyJobStatus, createdAt: '2024-03-03T00:00:00Z' }],
        }
        renderWithProviders(<ApprovalStatus job={job} orgSlug="test-org" type="files" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })

    it('renders nothing for disallowed status or missing status changes', () => {
        const runningJob = {
            ...baseJob,
            statusChanges: [{ status: 'JOB-RUNNING' as StudyJobStatus, createdAt: new Date().toISOString() }],
        }
        renderWithProviders(<ApprovalStatus job={runningJob} orgSlug="test-org" type="files" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        const initiatedJob = {
            ...baseJob,
            statusChanges: [{ status: 'INITIATED' as StudyJobStatus, createdAt: new Date().toISOString() }],
        }
        renderWithProviders(<ApprovalStatus job={initiatedJob} orgSlug="test-org" type="code" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()

        const noStatusJob = {
            ...baseJob,
            statusChanges: [],
        }
        renderWithProviders(<ApprovalStatus job={noStatusJob} orgSlug="test-org" type="files" />)
        expect(screen.queryByText(/Approved|Rejected/)).toBeNull()
    })
})
