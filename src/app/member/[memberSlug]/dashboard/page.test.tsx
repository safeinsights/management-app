import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import MemberDashboardPage from './page'
import { getMemberFromSlugAction } from '@/server/actions/member.actions'
import { faker } from '@faker-js/faker'
import { Member } from '@/schema/member'
import { StudyJobStatus, StudyStatus } from '@/database/types'
import { fetchStudiesForCurrentMemberAction } from '@/server/actions/study.actions'
import { useUser } from '@clerk/nextjs'
import { UseUserReturn } from '@clerk/types'

vi.mock('@/server/actions/member.actions', () => ({
    getMemberFromSlugAction: vi.fn(),
}))

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForCurrentMemberAction: vi.fn(),
}))

// TODO Extract out into a helper function that we can re-use
const mockMember: Member = {
    id: faker.string.uuid(),
    slug: 'test-member',
    name: faker.company.name(),
    email: faker.internet.email(),
    publicKey: 'fake-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

// TODO Extract out into a helper function that we can re-use
const mockStudies = [
    {
        id: 'study-1',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location1',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        memberId: 'member-1',
        outputMimeType: null,
        piName: 'PI Name 1',
        researcherId: 'researcher-1',
        reviewerName: 'Reviewer A',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 1',
        researcherName: 'Person A',
        latestJobStatus: 'JOB-PACKAGING' as StudyJobStatus,
        latestStudyJobId: 'job-1',
        memberSlug: 'test-member',
    },
    {
        id: 'study-2',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location2',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        memberId: 'member-2',
        outputMimeType: null,
        piName: 'PI Name 2',
        researcherId: 'researcher-2',
        status: 'APPROVED' as StudyStatus,
        title: 'Study Title 2',
        researcherName: 'Person B',
        reviewerName: 'Reviewer A',
        latestStudyJobId: 'job-2',
        latestJobStatus: 'RUN-COMPLETE' as StudyJobStatus,
        memberSlug: 'test-member',
    },
    {
        id: 'study-3',
        approvedAt: null,
        rejectedAt: null,
        containerLocation: 'Location3',
        createdAt: new Date(),
        dataSources: [],
        irbProtocols: null,
        memberId: 'member-3',
        outputMimeType: null,
        piName: 'PI Name 3',
        researcherId: 'researcher-3',
        reviewerName: 'Reviewer A',
        status: 'PENDING-REVIEW' as StudyStatus,
        title: 'Study Title 3',
        researcherName: 'Person C',
        latestStudyJobId: null,
        latestJobStatus: null,
        memberSlug: 'test-member',
    },
]

beforeEach(() => {
    vi.mocked(useUser).mockReturnValue({
        user: {
            firstName: 'Tester',
        },
    } as UseUserReturn)
})

describe('Member Dashboard', () => {
    it('renders an error when the member is not found', async () => {
        const props = {
            params: Promise.resolve({ memberSlug: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))

        expect(screen.getByText(/Member was not found/i)).toBeDefined()
    })

    it('renders the welcome text', async () => {
        vi.mocked(fetchStudiesForCurrentMemberAction).mockResolvedValue([])
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberSlug: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))

        expect(screen.getByText(/Welcome to your SafeInsights dashboard!/i)).toBeDefined()
    })
})

describe('Studies Table', () => {
    it('renders empty state when no studies', async () => {
        vi.mocked(fetchStudiesForCurrentMemberAction).mockResolvedValue([])
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberSlug: 'test-member' }),
        }
        renderWithProviders(await MemberDashboardPage(props))

        expect(screen.getByText(/You have no studies to review/i)).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        vi.mocked(fetchStudiesForCurrentMemberAction).mockResolvedValue(mockStudies)
        vi.mocked(getMemberFromSlugAction).mockResolvedValue(mockMember)

        const props = {
            params: Promise.resolve({ memberSlug: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})
