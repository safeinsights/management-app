import { StudyJobStatus, StudyStatus } from '@/database/types'
import { renderWithProviders } from '@/tests/unit.helpers'
import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudiesTable } from './index'

import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'
import { fetchStudiesForOrgAction } from '@/server/actions/study.actions'

vi.mock('@/server/actions/org.actions', () => ({
    getOrgFromSlugAction: vi.fn(),
}))

vi.mock('@/components/spy-mode-context', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/components/spy-mode-context')>()),
    useSpyMode: () => ({ isSpyMode: false, toggleSpyMode: vi.fn() }),
}))

const mockStudies = [
    {
        id: '11111111-1111-4111-8111-111111111111',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location1',
        createdAt: new Date(),
        submittedAt: new Date(),
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
        submittedAt: new Date(),
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
        submittedAt: new Date(),
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
        isLoaded: true,
        isSignedIn: true,
        user: {
            id: 'test-clerk-user-id',
            firstName: 'Tester',
            publicMetadata: {
                format: 'v3',
                user: { id: 'test-user-id' },
                teams: null,
                orgs: {
                    'test-org': {
                        id: 'test-org-id',
                        slug: 'test-org',
                        type: 'enclave',
                        isAdmin: false,
                    },
                },
            },
            unsafeMetadata: {
                currentOrgSlug: 'test-org',
            },
        },
    } as unknown as UseUserReturn)
})

describe('Studies Table', () => {
    it('renders empty state when no studies', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug="test-org"
                title="Review Studies"
                showRefresher
                paperWrapper
            />,
        )

        expect(await screen.findByText(/You have no studies to review/i)).toBeDefined()
    })

    it('renders header actions when the table is empty', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug="test-org"
                title="Review Studies"
                showRefresher
                paperWrapper
                headerActions={<button type="button">Toggle Placeholder</button>}
            />,
        )

        expect(await screen.findByText(/You have no studies to review/i)).toBeDefined()
        expect(screen.getByText('Review Studies')).toBeDefined()
        expect(screen.getByText('Toggle Placeholder')).toBeDefined()
    })

    it('renders researcher empty state copy', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable audience="researcher" scope="org" orgSlug="test-org" title="Proposed Studies" paperWrapper />,
        )

        expect(await screen.findByText(/You haven't started a study yet/i)).toBeDefined()
    })

    it('renders reviewer empty state copy', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug="test-org" title="Review Studies" paperWrapper />,
        )

        expect(await screen.findByText(/You have no studies to review/i)).toBeDefined()
    })

    it('does not duplicate the new study button on an empty lab org dashboard', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable
                audience="researcher"
                scope="org"
                orgSlug="test-org"
                title="Proposed Studies"
                showNewStudyButton
                paperWrapper
            />,
        )

        await screen.findByText(/You haven't started a study yet/i)
        expect(screen.getAllByTestId('new-study')).toHaveLength(1)
    })

    it('does not show the new study button on an empty enclave org dashboard', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockResolvedValueOnce([])
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug="test-org" title="Review Studies" paperWrapper />,
        )

        await screen.findByText(/You have no studies to review/i)
        expect(screen.queryByTestId('new-study')).toBeNull()
    })

    it('surfaces the query error message when loading fails', async () => {
        vi.mocked(fetchStudiesForOrgAction).mockRejectedValueOnce(new Error('boom'))
        renderWithProviders(
            <StudiesTable audience="reviewer" scope="org" orgSlug="test-org" title="Review Studies" paperWrapper />,
        )

        expect(await screen.findByText(/Failed to load studies: .*boom/i)).toBeDefined()
        expect(screen.getByText('Review Studies')).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        renderWithProviders(
            <StudiesTable
                audience="reviewer"
                scope="org"
                orgSlug="test-org"
                title="Review Studies"
                showRefresher
                paperWrapper
            />,
        )

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})
