import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewerStudiesTable } from './reviewer-table'

import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'

vi.mock('@/server/actions/org.actions', () => ({
    getOrgFromSlugAction: vi.fn(),
}))

const mockStudies = [
    {
        id: '11111111-1111-4111-8111-111111111111',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location1',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        orgId: 'org-1',
        outputMimeType: null,
        piName: 'PI Name 1',
        researcherId: 'researcher-1',
        reviewerName: 'Reviewer A',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 1',
        createdBy: 'Person A',
        jobStatusChanges: [{ status: 'JOB-PACKAGING' as StudyJobStatus, userId: null }],
        latestStudyJobId: 'job-1',
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
    {
        id: '22222222-2222-4222-8222-222222222222',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location2',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        orgId: 'org-2',
        outputMimeType: null,
        piName: 'PI Name 2',
        researcherId: 'researcher-2',
        status: 'APPROVED' as StudyStatus,
        title: 'Study Title 2',
        createdBy: 'Person B',
        reviewerName: 'Reviewer A',
        latestStudyJobId: 'job-2',
        jobStatusChanges: [{ status: 'RUN-COMPLETE' as StudyJobStatus, userId: null }],
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
    {
        id: '33333333-3333-4333-8333-333333333333',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location3',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        orgId: 'org-3',
        outputMimeType: null,
        piName: 'PI Name 3',
        researcherId: 'researcher-3',
        reviewerName: 'Reviewer A',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 3',
        createdBy: 'Person C',
        latestStudyJobId: null,
        jobStatusChanges: [],
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
]

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForOrgAction: vi.fn(() => mockStudies),
}))

beforeEach(() => {
    vi.mocked(useUser).mockReturnValue({
        user: {
            firstName: 'Tester',
        },
    } as UseUserReturn)
})

describe('Studies Table', () => {
    it('renders empty state when no studies', async () => {
        renderWithProviders(<ReviewerStudiesTable orgSlug="test-org" />)

        expect(screen.getByText(/You have no studies to review/i)).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        renderWithProviders(<ReviewerStudiesTable orgSlug="test-org" />)

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})
