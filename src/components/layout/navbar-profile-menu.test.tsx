import {
    afterEach,
    beforeEach,
    describe,
    it,
    expect,
    mockSignOutBehavior,
    screen,
    userEvent,
    waitFor,
} from '@/tests/unit.helpers'
import { cleanup, render, act } from '@testing-library/react'
import { AppShell } from '@mantine/core'
import { useClearCacheOnUserChange } from '@/hooks/use-clear-cache-on-user-change'
import { getQueryClient, Providers } from './providers'
import { NavbarProfileMenu } from './navbar-profile-menu'

function CacheClearerWrapper({ children }: { children: React.ReactNode }) {
    useClearCacheOnUserChange()
    return <>{children}</>
}

function createTree() {
    return (
        <Providers>
            <CacheClearerWrapper>
                <AppShell>
                    <NavbarProfileMenu />
                </AppShell>
            </CacheClearerWrapper>
        </Providers>
    )
}

describe('NavbarProfileMenu', () => {
    beforeEach(() => {
        mockSignOutBehavior()
    })

    afterEach(() => {
        getQueryClient().clear()
        cleanup()
    })

    async function signOutAndRerender(rerender: (ui: React.ReactElement) => void) {
        const toggleButton = screen.getByRole('button', { name: 'Toggle profile menu' })
        await userEvent.click(toggleButton)
        const signOutButton = screen.getByRole('menuitem', { name: 'Sign Out' })
        await userEvent.click(signOutButton)

        // Simulate Clerk's context update: userId is now null, force re-render
        await act(() => {
            rerender(createTree())
        })
    }

    it('clears researcher org cache on sign-out', async () => {
        const queryClient = getQueryClient()
        queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'lab-org', type: 'lab', name: 'Lab Org' }])

        const { rerender } = render(createTree())
        await signOutAndRerender(rerender)

        await waitFor(() => {
            expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
        })
    })

    it('clears reviewer org cache on sign-out', async () => {
        const queryClient = getQueryClient()
        queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'enclave-org', type: 'enclave', name: 'Enclave Org' }])

        const { rerender } = render(createTree())
        await signOutAndRerender(rerender)

        await waitFor(() => {
            expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
        })
    })

    it('clears all query data on sign-out, not just orgs', async () => {
        const queryClient = getQueryClient()
        queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'org', type: 'lab', name: 'Org' }])
        queryClient.setQueryData(['user-researcher-studies'], [{ id: '1', title: 'Study' }])

        const { rerender } = render(createTree())
        await signOutAndRerender(rerender)

        await waitFor(() => {
            expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
            expect(queryClient.getQueryData(['user-researcher-studies'])).toBeUndefined()
        })
    })
})
