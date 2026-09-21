import { mockClerkSession, mockPathname, renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import { AppShell } from '@mantine/core'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavbarProfileMenu } from './navbar-profile-menu'

// Menu rows mount in a collapsed AppShellSection, so queries need `hidden: true`.
const renderMenu = () =>
    renderWithProviders(
        <AppShell>
            <NavbarProfileMenu />
        </AppShell>,
    )

describe('NavbarProfileMenu security key entry', () => {
    it('shows the Security key entry for a Data Partner (enclave) user', () => {
        mockClerkSession({ clerkUserId: 'c1', userId: 'u1', orgSlug: 'dp', orgType: 'enclave' })
        renderMenu()

        expect(screen.getByRole('menuitem', { name: 'Security key', hidden: true })).toBeDefined()
    })

    it('shows the Security key entry for a Research Lab (lab) user', () => {
        mockClerkSession({ clerkUserId: 'c2', userId: 'u2', orgSlug: 'rl', orgType: 'lab' })
        renderMenu()

        expect(screen.getByRole('menuitem', { name: 'Security key', hidden: true })).toBeDefined()
    })

    it('no longer renders the legacy "Results Key" label', () => {
        mockClerkSession({ clerkUserId: 'c3', userId: 'u3', orgSlug: 'rl', orgType: 'lab' })
        renderMenu()

        expect(screen.queryByText('Results Key')).toBeNull()
    })
})

describe('NavbarProfileMenu SI Admin submenu', () => {
    it('does not render the SI Admin entry for a non-SI-admin user', () => {
        mockClerkSession({ clerkUserId: 'c4', userId: 'u4', orgSlug: 'rl', orgType: 'lab' })
        renderMenu()

        expect(screen.queryByRole('menuitem', { name: 'SI Admin', hidden: true })).toBeNull()
    })

    it('renders the SI Admin entry for an SI admin user', () => {
        mockClerkSession({ clerkUserId: 'c5', userId: 'u5', orgSlug: 'si', orgType: 'enclave', isSiAdmin: true })
        renderMenu()

        expect(screen.getByRole('menuitem', { name: 'SI Admin', hidden: true })).toBeDefined()
    })

    it('expands to both admin sub-pages with the correct routes when on an admin page', () => {
        mockPathname(Routes.adminSafeinsights)
        mockClerkSession({ clerkUserId: 'c6', userId: 'u6', orgSlug: 'si', orgType: 'enclave', isSiAdmin: true })
        renderMenu()

        const orgsLink = screen.getByRole('link', { name: 'Orgs & Context', hidden: true })
        const legalLink = screen.getByRole('link', { name: 'Legal', hidden: true })

        expect(orgsLink.getAttribute('href')).toBe(Routes.adminSafeinsights)
        expect(legalLink.getAttribute('href')).toBe(Routes.adminSafeinsightsLegal)
    })

    it('toggles the sub-pages open when SI Admin is clicked', async () => {
        // userKey is pinned, so the outer menu is open while the admin submenu starts collapsed.
        mockPathname(Routes.userKey)
        mockClerkSession({ clerkUserId: 'c7', userId: 'u7', orgSlug: 'si', orgType: 'enclave', isSiAdmin: true })
        renderMenu()

        expect(screen.queryByRole('link', { name: 'Legal' })).toBeNull()

        await userEvent.click(screen.getByRole('menuitem', { name: 'SI Admin' }))

        expect(screen.getByRole('link', { name: 'Legal' })).toBeVisible()
    })
})

describe('NavbarProfileMenu legal entry', () => {
    it('shows the personal Legal entry for a non-SI-admin user', () => {
        mockClerkSession({ clerkUserId: 'c8', userId: 'u8', orgSlug: 'dp', orgType: 'enclave' })
        renderMenu()

        expect(screen.getByRole('menuitem', { name: 'Legal', hidden: true })).toBeDefined()
    })

    it('navigates to the legal page when clicked', async () => {
        mockPathname('/dashboard')
        mockClerkSession({ clerkUserId: 'c9', userId: 'u9', orgSlug: 'rl', orgType: 'lab' })
        renderMenu()

        await userEvent.click(screen.getByRole('menuitem', { name: 'Legal', hidden: true }))

        expect(memoryRouter.asPath).toBe(Routes.legal)
    })

    // A pinned route, like every other profile-menu destination, so the menu must not collapse on
    // arrival. Queried without `hidden`, which would also match the collapsed state.
    it('leaves the menu open on the legal page', () => {
        mockPathname(Routes.legal)
        mockClerkSession({ clerkUserId: 'c11', userId: 'u11', orgSlug: 'dp', orgType: 'enclave' })
        renderMenu()

        expect(screen.getByRole('menuitem', { name: 'Legal' })).toBeVisible()
    })

    // The SI-admin submenu has its own 'Legal', so the two must stay distinguishable: the personal
    // one is a button, the SI-admin one a link.
    it('keeps the personal entry separate from the SI Admin submenu entry', () => {
        mockPathname(Routes.adminSafeinsights)
        mockClerkSession({ clerkUserId: 'c10', userId: 'u10', orgSlug: 'si', orgType: 'enclave', isSiAdmin: true })
        renderMenu()

        expect(screen.getByRole('menuitem', { name: 'Legal', hidden: true })).toBeDefined()
        expect(screen.getByRole('link', { name: 'Legal', hidden: true }).getAttribute('href')).toBe(
            Routes.adminSafeinsightsLegal,
        )
    })
})
