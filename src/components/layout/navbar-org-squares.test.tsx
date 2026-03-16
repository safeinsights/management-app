import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen, mockPathname } from '@/tests/unit.helpers'
import { NavbarOrgSquares } from './navbar-org-squares'

const makeOrg = (overrides: Partial<Parameters<typeof NavbarOrgSquares>[0]['orgs'][number]> = {}) => ({
    id: 'org-1',
    name: 'Test Enclave',
    slug: 'test-enclave',
    type: 'enclave' as const,
    eventCount: 0,
    ...overrides,
})

describe('NavbarOrgSquares', () => {
    describe('badge visibility', () => {
        it('does not show a badge when eventCount is 0', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: 0 })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            expect(screen.queryByText('0')).toBeNull()
        })

        it('shows a badge when eventCount is positive', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: 3 })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            expect(screen.getByText('3')).toBeDefined()
        })

        it('hides the badge when the org is active (focused)', () => {
            mockPathname('/test-enclave/dashboard')
            const orgs = [makeOrg({ eventCount: 5 })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={false} orgs={orgs} focusedOrgSlug="test-enclave" />)

            expect(screen.queryByText('5')).toBeNull()
        })

        it('shows badges on all orgs when on My Dashboard', () => {
            mockPathname('/dashboard')
            const orgs = [
                makeOrg({ id: 'org-1', slug: 'enclave-a', name: 'Enclave A', eventCount: 2 }),
                makeOrg({ id: 'org-2', slug: 'lab-b', name: 'Lab B', type: 'lab', eventCount: 4 }),
            ]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            expect(screen.getByText('2')).toBeDefined()
            expect(screen.getByText('4')).toBeDefined()
        })

        it('does not show badge when eventCount is null', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: undefined })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            const badges = screen.queryAllByText(/^\d+$/)
            expect(badges).toHaveLength(0)
        })

        it('does not show badge when eventCount is string "0" from SQL', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: '0' as unknown as number })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            expect(screen.queryByText('0')).toBeNull()
        })

        it('shows badge when eventCount is a string number from SQL', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: '3' as unknown as number })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            expect(screen.getByText('3')).toBeDefined()
        })

        it('shows badge when eventCount is a bigint from SQL', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: 5n as unknown as number })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            expect(screen.getByText('5')).toBeDefined()
        })

        it('does not show badge when eventCount is bigint 0n from SQL', () => {
            mockPathname('/dashboard')
            const orgs = [makeOrg({ eventCount: 0n as unknown as number })]

            renderWithProviders(<NavbarOrgSquares isMainDashboard={true} orgs={orgs} focusedOrgSlug={null} />)

            const badges = screen.queryAllByText(/^\d+$/)
            expect(badges).toHaveLength(0)
        })
    })
})
