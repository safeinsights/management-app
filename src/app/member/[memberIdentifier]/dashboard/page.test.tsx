import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import * as memberActions from '@/server/actions/member-actions'
import * as studyActions from '@/server/actions/study-actions'
import { renderWithProviders } from '@/tests/unit.helpers'
import MemberDashboardPage from './page'
import { Member } from '@/schema/member'

const mockMember: Member = {
    id: '1',
    identifier: 'test-member',
    name: 'Test Member',
    email: 'test@example.com',
    publicKey: 'test-key',
    createdAt: new Date(),
    updatedAt: new Date(),
}

const mockStudies = [
    {
        approvedAt: null,
        containerLocation: 'Location1',
        createdAt: new Date(),
        dataSources: [],
        description: 'Description for Study 1',
        id: 'study-1',
        irbProtocols: null,
        memberId: 'member-1',
        outputMimeType: null,
        piName: 'PI Name 1',
        researcherId: 'researcher-1',
        status: 'INITIATED' as const,
        title: 'Study Title 1',
        researcherName: 'Person A',
    },
    {
        approvedAt: null,
        containerLocation: 'Location2',
        createdAt: new Date(),
        dataSources: [],
        description: 'Description for Study 2',
        id: 'study-2',
        irbProtocols: null,
        memberId: 'member-2',
        outputMimeType: null,
        piName: 'PI Name 2',
        researcherId: 'researcher-2',
        status: 'APPROVED' as const,
        title: 'Study Title 2',
        researcherName: 'Person B',
    },
    {
        approvedAt: null,
        containerLocation: 'Location3',
        createdAt: new Date(),
        dataSources: [],
        description: 'Description for Study 3',
        id: 'study-3',
        irbProtocols: null,
        memberId: 'member-3',
        outputMimeType: null,
        piName: 'PI Name 3',
        researcherId: 'researcher-3',
        status: 'PENDING-REVIEW' as const,
        title: 'Study Title 3',
        researcherName: 'Person C',
    },
]

vi.mock('@/server/actions/member-actions', () => ({
    getMemberFromIdentifier: vi.fn(),
}))

vi.mock('@/server/actions/study-actions', () => ({
    fetchStudiesForMember: vi.fn(),
}))

describe('StudyReviewPage', () => {
    it('renders an error when the member is not found', async () => {
        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))

        await waitFor(() => {
            expect(screen.getByText(/Member was not found/i)).toBeDefined()
        })
    })

    it('renders empty state when no studies', async () => {
        vi.mocked(memberActions.getMemberFromIdentifier).mockResolvedValue(mockMember)
        vi.mocked(studyActions.fetchStudiesForMember).mockResolvedValue([])

        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))
        expect(screen.getByText('There are no studies to view at this time')).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        vi.mocked(memberActions.getMemberFromIdentifier).mockResolvedValue(mockMember)
        vi.mocked(studyActions.fetchStudiesForMember).mockResolvedValue(mockStudies)

        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))
        expect(screen.getAllByText('Proceed to review ≫')).toHaveLength(3)
    })
})
