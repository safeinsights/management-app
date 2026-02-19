import { afterEach, beforeEach, describe, it, expect, screen, userEvent, type Mock } from '@/tests/unit.helpers'
import { useUser } from '@clerk/nextjs'
// eslint-disable-next-line no-restricted-imports
import { QueryClientProvider } from '@tanstack/react-query'
import { render, cleanup } from '@testing-library/react'
import { AppShell, MantineProvider } from '@mantine/core'
import { theme } from '@/theme'
import { getQueryClient } from './providers'
import { NavbarProfileMenu } from './navbar-profile-menu'

function renderWithSingletonClient(ui: React.ReactElement) {
    const queryClient = getQueryClient()
    return {
        queryClient,
        ...render(
            <QueryClientProvider client={queryClient}>
                <MantineProvider theme={theme}>
                    <AppShell>{ui}</AppShell>
                </MantineProvider>
            </QueryClientProvider>,
        ),
    }
}

describe('NavbarProfileMenu', () => {
    beforeEach(() => {
        ;(useUser as Mock).mockReturnValue({ user: null, isLoaded: false, isSignedIn: false })
    })

    afterEach(() => {
        getQueryClient().clear()
        cleanup()
    })

    async function openMenuAndSignOut() {
        const toggleButton = screen.getByRole('button', { name: 'Toggle profile menu' })
        await userEvent.click(toggleButton)
        const signOutButton = screen.getByRole('menuitem', { name: 'Sign Out' })
        await userEvent.click(signOutButton)
    }

    it('clears researcher org cache on sign-out', async () => {
        const queryClient = getQueryClient()
        queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'lab-org', type: 'lab', name: 'Lab Org' }])

        renderWithSingletonClient(<NavbarProfileMenu />)
        await openMenuAndSignOut()

        expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
    })

    it('clears reviewer org cache on sign-out', async () => {
        const queryClient = getQueryClient()
        queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'enclave-org', type: 'enclave', name: 'Enclave Org' }])

        renderWithSingletonClient(<NavbarProfileMenu />)
        await openMenuAndSignOut()

        expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
    })

    it('clears all query data on sign-out, not just orgs', async () => {
        const queryClient = getQueryClient()
        queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'org', type: 'lab', name: 'Org' }])
        queryClient.setQueryData(['user-researcher-studies'], [{ id: '1', title: 'Study' }])

        renderWithSingletonClient(<NavbarProfileMenu />)
        await openMenuAndSignOut()

        expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
        expect(queryClient.getQueryData(['user-researcher-studies'])).toBeUndefined()
    })
})
