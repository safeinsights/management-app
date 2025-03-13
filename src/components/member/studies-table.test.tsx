import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { fetchStudiesForMember } from '@/server/actions/study-actions'
import { renderWithProviders } from '@/tests/unit.helpers'
import { Member } from '@/schema/member'
import { useUser } from '@clerk/nextjs'
import { UserResource } from '@clerk/types'
import { StudiesTable } from '@/components/member/studies-table'

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
        rejectedAt: null,
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
        rejectedAt: null,
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
        rejectedAt: null,
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

vi.mock('@/server/actions/study-actions', () => ({
    fetchStudiesForMember: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

describe('Member Dashboard', () => {
    it('renders empty state when no studies', async () => {
        vi.mocked(fetchStudiesForMember).mockResolvedValue([])
        vi.mocked(useUser).mockResolvedValue({
            isLoaded: true,
            isSignedIn: true,
            user: {
                firstName: 'Chris',
            } as UserResource,
        })

        renderWithProviders(<StudiesTable member={mockMember} />)
        expect(screen.getByText(/You have no studies to review/i)).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        vi.mocked(useUser).mockResolvedValue({
            isLoaded: true,
            isSignedIn: true,
            user: {
                firstName: 'Chris',
            } as UserResource,
        })

        vi.mocked(fetchStudiesForMember).mockResolvedValue(mockStudies)

        renderWithProviders(<StudiesTable member={mockMember} />)

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})
