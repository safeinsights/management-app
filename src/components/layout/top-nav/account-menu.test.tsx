import {
    describe,
    expect,
    it,
    mockClerkSession,
    mockPathname,
    renderWithProviders,
    screen,
    userEvent,
    within,
} from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import { AccountMenu } from './account-menu'

// The popover fades in, so the first query after opening waits for the transition to settle.
const openMenu = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Toggle profile menu' }))
    await screen.findByRole('button', { name: 'Log out' })
}

describe('AccountMenu', () => {
    it('opens a popover of links rather than an ARIA menu, with the researcher profile for lab members', async () => {
        mockPathname(Routes.dashboard)
        mockClerkSession({ clerkUserId: 'c1', userId: 'u1', orgSlug: 'rl', orgType: 'lab' })
        renderWithProviders(<AccountMenu />)

        expect(screen.queryByRole('link', { name: 'Legal' })).toBeNull()
        await openMenu()

        expect(screen.queryByRole('menu')).toBeNull()
        expect(screen.getByRole('link', { name: 'Professional profile' })).toHaveAttribute(
            'href',
            Routes.researcherProfile,
        )
        expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Security key' })).toHaveAttribute('href', Routes.userKey)
        expect(screen.getByRole('link', { name: 'Legal' })).toHaveAttribute('href', Routes.legal)
        expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Toggle profile menu' })).toHaveAttribute('aria-expanded', 'true')
    })

    it('hides the researcher profile from a data partner user and the SI console from non-SI admins', async () => {
        mockPathname(Routes.dashboard)
        mockClerkSession({ clerkUserId: 'c2', userId: 'u2', orgSlug: 'dp', orgType: 'enclave' })
        renderWithProviders(<AccountMenu />)
        await openMenu()

        expect(screen.queryByRole('link', { name: 'Professional profile' })).toBeNull()
        expect(screen.queryByRole('link', { name: 'Orgs & Context' })).toBeNull()
    })

    it('adds the SI admin console pages for SI admins', async () => {
        mockPathname(Routes.adminSafeinsights)
        mockClerkSession({ clerkUserId: 'c3', userId: 'u3', orgSlug: 'si', orgType: 'enclave', isSiAdmin: true })
        renderWithProviders(<AccountMenu />)
        await openMenu()

        expect(screen.getByRole('link', { name: 'Orgs & Context' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByRole('link', { name: 'SafeInsights legal' })).toHaveAttribute(
            'href',
            Routes.adminSafeinsightsLegal,
        )
    })

    it('closes when an item is chosen', async () => {
        mockPathname(Routes.dashboard)
        mockClerkSession({ clerkUserId: 'c4', userId: 'u4', orgSlug: 'dp', orgType: 'enclave' })
        renderWithProviders(<AccountMenu />)
        await openMenu()

        await userEvent.click(screen.getByRole('link', { name: 'Legal' }))

        expect(screen.getByRole('button', { name: 'Toggle profile menu' })).toHaveAttribute('aria-expanded', 'false')
    })

    it('shows initials from the first and last name, never the Clerk image', () => {
        mockPathname(Routes.dashboard)
        mockClerkSession({
            clerkUserId: 'c6',
            userId: 'u6',
            orgSlug: 'dp',
            orgType: 'enclave',
            firstName: 'Mary',
            lastName: 'Van Dyke',
            imageUrl: 'https://img.clerk.com/default-avatar.png',
        })
        renderWithProviders(<AccountMenu />)

        const trigger = screen.getByRole('button', { name: 'Toggle profile menu' })
        expect(within(trigger).getByText('MV')).toBeInTheDocument()
        expect(within(trigger).queryByRole('img')).toBeNull()
    })

    it('keeps a name initial that spans two UTF-16 code units whole', () => {
        mockPathname(Routes.dashboard)
        mockClerkSession({
            clerkUserId: 'c7',
            userId: 'u7',
            orgSlug: 'dp',
            orgType: 'enclave',
            firstName: '𠮷田',
            lastName: 'Lee',
        })
        renderWithProviders(<AccountMenu />)

        const trigger = screen.getByRole('button', { name: 'Toggle profile menu' })
        expect(within(trigger).getByText('𠮷L')).toBeInTheDocument()
    })

    it('closes on Escape while the trigger still has focus', async () => {
        mockPathname(Routes.dashboard)
        mockClerkSession({ clerkUserId: 'c5', userId: 'u5', orgSlug: 'dp', orgType: 'enclave' })
        renderWithProviders(<AccountMenu />)
        await openMenu()

        const trigger = screen.getByRole('button', { name: 'Toggle profile menu' })
        expect(trigger).toHaveFocus()
        await userEvent.keyboard('{Escape}')

        expect(trigger).toHaveAttribute('aria-expanded', 'false')
    })
})
