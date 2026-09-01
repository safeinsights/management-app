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
    act,
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
        }
        await mockSessionWithTestData({ orgSlug, isAdmin: true })

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
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
        }

        await mockSessionWithTestData()
        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        const adminButton = screen.getByRole('button', { name: /Admin/i })
        await userEvent.click(adminButton)
        expect(screen.getByRole('link', { name: 'Team' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Legal center' }).getAttribute('href')).toMatch(/\/admin\/legal$/)
    })

    // Settings is enclave-only; the Legal center is not, since a lab reads its ROPA there.
    it('shows the legal center to a lab admin, which has no Settings link', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'lab' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData({ orgSlug, orgType: 'lab', isAdmin: true })

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        await userEvent.click(screen.getByRole('button', { name: /Admin/i }))

        expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Legal center' }).getAttribute('href')).toMatch(/\/admin\/legal$/)
    })

    it('is open by default when on an admin page', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData()
        mockPathname(`/${orgSlug}/admin/team`)

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        expect(screen.getByRole('link', { name: 'Team' })).toBeVisible()
        expect(screen.getByRole('link', { name: 'Settings' })).toBeVisible()
    })

    it('re-syncs the submenu open state when the route changes', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData()
        mockPathname('/')

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)

        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()

        await act(async () => {
            mockPathname(`/${orgSlug}/admin/team`)
        })
        expect(screen.getByRole('link', { name: 'Team' })).toBeVisible()

        await act(async () => {
            mockPathname('/')
        })
        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()
    })

    it('marks the Admin link active when on an org admin page', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData()
        mockPathname(`/${orgSlug}/admin/legal`)

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        expect(screen.getByRole('link', { name: 'Legal center' })).toBeVisible()
        expect(screen.getByRole('button', { name: /Admin/i })).toHaveAttribute('data-active', 'true')
    })

    // Defensive: AppNav only mounts this when the route resolves to an org, and `admin` is a
    // NON_ORG_PREFIX.
    it('is open by default on a top-level admin path too', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData()
        mockPathname('/admin/safeinsights')

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        expect(screen.getByRole('link', { name: 'Team' })).toBeVisible()
        expect(screen.getByRole('button', { name: /Admin/i })).toHaveAttribute('data-active', 'true')
    })

    it('leaves the submenu closed on a non-admin org page', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData()
        mockPathname(`/${orgSlug}/dashboard`)

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Admin/i })).not.toHaveAttribute('data-active')
    })

    it('toggles the submenu on click', async () => {
        const orgSlug = faker.lorem.slug()
        const org = {
            type: 'enclave' as const,
            name: faker.company.name(),
            id: faker.string.uuid(),
            slug: orgSlug,
        }
        await mockSessionWithTestData()
        mockPathname('/')

        renderWithProviders(<OrgAdminDashboardLink isVisible={true} org={org} />)
        const adminButton = screen.getByRole('button', { name: /Admin/i })

        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()

        await userEvent.click(adminButton)
        expect(screen.getByRole('link', { name: 'Team' })).toBeVisible()

        await userEvent.click(adminButton)
        expect(screen.queryByRole('link', { name: 'Team' })).not.toBeInTheDocument()
    })
})
