import {
    renderWithProviders,
    mockSessionWithTestData,
    describe,
    it,
    expect,
    screen,
    faker,
    userEvent,
    mockPathname,
} from '@/tests/unit.helpers'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'

describe('OrgAdminDashboardLink', () => {
    it('has all submenu URLs starting with /admin/', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
            eventCount: 0,
        }
        // Mock session for an admin user to ensure all links are visible
        await mockSessionWithTestData({ orgSlug, isAdmin: true })

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        // Click the Admin button to ensure the menu is open
        const adminButton = screen.getByRole('button', { name: /Admin/i })
        await userEvent.click(adminButton)
    })

    it('renders nothing when isVisible is false', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
            eventCount: 0,
        }
        await mockSessionWithTestData()
        renderWithProviders(<OrgAdminDashboardLink isVisible={false} org={org} />)
        expect(screen.queryByRole('button', { name: /Admin/i })).not.toBeInTheDocument()
    })

    it('shows admin links for org admins', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
            eventCount: 0,
        }

        // Test with regular Org Admin
        await mockSessionWithTestData()
        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        const adminButton = screen.getByRole('button', { name: /Admin/i })
        await userEvent.click(adminButton)
        expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
    })

    it('is open by default when on an admin page', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
            eventCount: 0,
        }
        await mockSessionWithTestData()
        mockPathname(`/admin/team/${orgSlug}`)

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        expect(screen.getByRole('link', { name: 'Team' })).toBeVisible()
        expect(screen.getByRole('link', { name: 'Settings' })).toBeVisible()
    })

    it('toggles the submenu on click', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
            eventCount: 0,
        }
        await mockSessionWithTestData()
        mockPathname('/')

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        const adminButton = screen.getByRole('button', { name: /Admin/i })

        // Menu should be closed initially
        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()

        // Click to open
        await userEvent.click(adminButton)
        expect(screen.getByRole('link', { name: 'Team' })).toBeVisible()

        // Click to close
        await userEvent.click(adminButton)
        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()
    })
})
