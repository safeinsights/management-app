import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import MemberDashboardPage from './page'
import { getMemberFromIdentifierAction } from '@/server/actions/member.actions'
import { faker } from '@faker-js/faker'
import { Member } from '@/schema/member'
import { SiUser } from '@/server/db/queries'
import { currentUser } from '@clerk/nextjs/server'

vi.mock('@/server/actions/member.actions', () => ({
    getMemberFromIdentifierAction: vi.fn(),
}))

vi.mock('@clerk/nextjs/server', () => ({
    currentUser: vi.fn(),
}))

vi.mock('@/server/actions/study.actions', () => ({
    fetchStudiesForCurrentMemberAction: vi.fn(),
}))

const mockMember: Member = {
    createdAt: new Date(),
    email: faker.internet.email(),
    id: faker.string.uuid(),
    identifier: faker.company.buzzAdjective(),
    name: faker.company.name(),
    publicKey: 'fake-key',
    updatedAt: new Date(),
}

describe('Member Dashboard', () => {
    it('renders an error when the member is not found', async () => {
        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))

        expect(screen.getByText(/Member was not found/i)).toBeDefined()
    })

    it('renders the welcome text', async () => {
        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        vi.mocked(getMemberFromIdentifierAction).mockResolvedValue(mockMember)

        vi.mocked(currentUser).mockResolvedValue({
            firstName: 'Test User',
        } as SiUser)

        renderWithProviders(await MemberDashboardPage(props))

        expect(screen.getByText(/Welcome to your SafeInsights dashboard!/i)).toBeDefined()
        expect(screen.getByText(/Hi Test User!/i)).toBeDefined()
    })
})
