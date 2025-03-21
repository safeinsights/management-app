import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/tests/unit.helpers'
import MemberDashboardPage from './page'

vi.mock('@/server/actions/member-actions', () => ({
    getMemberFromIdentifier: vi.fn(),
}))

describe('Member Dashboard', () => {
    it('renders an error when the member is not found', async () => {
        const props = {
            params: Promise.resolve({ memberIdentifier: 'test-member' }),
        }

        renderWithProviders(await MemberDashboardPage(props))

        expect(screen.getByText(/Member was not found/i)).toBeDefined()
    })
})
