import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import * as memberActions from '@/server/actions/member-actions'
import * as studyActions from '@/server/actions/study-actions'
import { renderWithProviders } from '@/tests/unit.helpers'
import StudyReviewPage from './page'
import { Member } from '@/schema/member'
import { Study } from '@/schema/study'

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
        id: 'study-12345',
        memberId: 'member-67890',
        piName: 'Dr. Jane Smith',
        status: 'APPROVED',
        title: 'Sleep Deprivation and Cognitive Decline',
    },
    {
        id: 'study-67890',
        memberId: 'member-12345',
        piName: 'Dr. John Doe',
        status: 'PENDING',
        title: 'Genetic Markers and Heart Disease',
    },
    {
        id: 'study-24680',
        memberId: 'member-54321',
        piName: 'Dr. Alice Johnson',
        status: 'REJECTED',
        title: 'Meditation and Brain Activity',
    },
] as Study[]

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

        renderWithProviders(await StudyReviewPage(props))

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

        renderWithProviders(await StudyReviewPage(props))
        expect(screen.getByText('There are no studies to view at this time')).toBeDefined()
    })

    it('renders the table when studies exist', async () => {
        vi.mocked(memberActions.getMemberFromIdentifier).mockResolvedValue(mockMember)
        vi.mocked(studyActions.fetchStudiesForMember).mockResolvedValue(mockStudies)

        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        renderWithProviders(await StudyReviewPage(props))
        expect(screen.getAllByText('Proceed to review ≫')).toHaveLength(3)
    })
})
