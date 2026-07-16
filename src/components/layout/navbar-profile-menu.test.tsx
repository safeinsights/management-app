import { mockClerkSession, renderWithProviders } from '@/tests/unit.helpers'
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
