import { mockClerkSession, mockPathname, renderWithProviders, userEvent } from '@/tests/unit.helpers'
import { Routes } from '@/lib/routes'
import { AppShell } from '@mantine/core'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NavbarProfileMenu } from './navbar-profile-menu'

// Menu rows mount in a collapsed AppShellSection, so wrap in AppShell and query with `hidden: true`.
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
        // userKey is a pinned route, so the outer profile menu is open but the admin
        // submenu starts collapsed (not an /admin/ page) — isolating the toggle behavior.
        mockPathname(Routes.userKey)
        mockClerkSession({ clerkUserId: 'c7', userId: 'u7', orgSlug: 'si', orgType: 'enclave', isSiAdmin: true })
        renderMenu()

        expect(screen.queryByRole('link', { name: 'Legal' })).toBeNull()

        await userEvent.click(screen.getByRole('menuitem', { name: 'SI Admin' }))

        expect(screen.getByRole('link', { name: 'Legal' })).toBeVisible()
    })
})
