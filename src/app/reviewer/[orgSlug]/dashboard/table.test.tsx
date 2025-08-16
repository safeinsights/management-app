import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudiesTable } from './table'

import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'

vi.mock('@/server/actions/org.actions', () => ({
    getOrgFromSlugAction: vi.fn(),
}))

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForOrgAction: vi.fn(),
}))

const mockStudies = [
    {
        id: 'study-1',
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
        latestJobStatus: 'JOB-PACKAGING' as StudyJobStatus,
        latestStudyJobId: 'job-1',
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
    {
        id: 'study-2',
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
        latestJobStatus: 'RUN-COMPLETE' as StudyJobStatus,
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
    {
        id: 'study-3',
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
        latestJobStatus: null,
        orgSlug: 'test-org',
        errorStudyJobId: null,
    },
]

beforeEach(() => {
    vi.mocked(useUser).mockReturnValue({
        user: {
            firstName: 'Tester',
        },
    } as UseUserReturn)
})

describe('Studies Table', () => {
    it('renders empty state when no studies', async () => {
        renderWithProviders(<StudiesTable orgSlug="test-org" studies={[]} />)

        expect(screen.getByText(/You have no studies to review/i)).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        renderWithProviders(<StudiesTable orgSlug="test-org" studies={mockStudies} />)

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})
