import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'
import { faker } from '@faker-js/faker'
import { MemberDashboard } from '@/app/member/[memberIdentifier]/dashboard/member-dashboard'
import { useUser } from '@clerk/nextjs'
import { UserResource, UseUserReturn } from '@clerk/types'
import { Member } from '@/schema/member'
import { fetchStudiesForMemberAction } from '@/server/actions/study.actions'
import { StudiesTable } from '@/app/member/[memberIdentifier]/dashboard/studies-table'

vi.mock('@/server/actions/member.actions', () => ({
    getMemberFromIdentifierAction: vi.fn(),
}))

vi.mock('@clerk/nextjs', () => ({
    useUser: vi.fn(),
}))

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForMemberAction: vi.fn(),
}))

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

describe('Member Dashboard', () => {
    it('renders the welcome text', async () => {
        vi.mocked(getMemberFromIdentifierAction).mockResolvedValue({
            createdAt: new Date(),
            email: faker.internet.email(),
            id: faker.string.uuid(),
            identifier: faker.company.buzzAdjective(),
            name: faker.company.name(),
            publicKey: 'fake-key',
            updatedAt: new Date(),
        })

        vi.mocked(useUser).mockResolvedValue({
            user: {
                id: '123',
                externalId: '456',
                primaryEmailAddressId: '123',
                firstName: 'Test User',
            },
        } as UseUserReturn)

        renderWithProviders(<MemberDashboard member={mockMember} />)

        expect(screen.getByText(/We’re so glad to have you/i)).toBeDefined()
    })
})

describe('Studies Table', () => {
    it('renders empty state when no studies', async () => {
        vi.mocked(fetchStudiesForMemberAction).mockResolvedValue([])
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

        vi.mocked(fetchStudiesForMemberAction).mockResolvedValue(mockStudies)

        renderWithProviders(<StudiesTable member={mockMember} />)

        await waitFor(() => {
            expect(screen.getByText(/Study Title 1/i)).toBeDefined()
        })
    })
})
