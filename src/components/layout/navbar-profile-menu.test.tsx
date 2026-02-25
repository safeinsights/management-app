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

function seedCache(queryClient: ReturnType<typeof getQueryClient>) {
    queryClient.setQueryData(['orgs-with-stats'], [{ slug: 'org', type: 'lab', name: 'Org' }])
    queryClient.setQueryData(['user-researcher-studies'], [{ id: '1', title: 'Study' }])
    queryClient.setQueryData(['notifications'], [{ id: 'n1', message: 'Hello' }])
}

function expectCacheCleared(queryClient: ReturnType<typeof getQueryClient>) {
    expect(queryClient.getQueryData(['orgs-with-stats'])).toBeUndefined()
    expect(queryClient.getQueryData(['user-researcher-studies'])).toBeUndefined()
    expect(queryClient.getQueryData(['notifications'])).toBeUndefined()
}

function expectCacheIntact(queryClient: ReturnType<typeof getQueryClient>) {
    expect(queryClient.getQueryData(['orgs-with-stats'])).toBeDefined()
    expect(queryClient.getQueryData(['user-researcher-studies'])).toBeDefined()
    expect(queryClient.getQueryData(['notifications'])).toBeDefined()
}

describe('NavbarProfileMenu – cache clearing on user change', () => {
    let mockController: ReturnType<typeof mockSignOutBehavior>

    beforeEach(() => {
        mockController = mockSignOutBehavior()
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

        await act(() => {
            rerender(createTree())
        })
    }

    it('clears all query data on sign-out', async () => {
        const queryClient = getQueryClient()
        seedCache(queryClient)

        const { rerender } = render(createTree())
        await signOutAndRerender(rerender)

        await waitFor(() => {
            expectCacheCleared(queryClient)
        })
    })

    it('does not clear cache on re-render with the same user', async () => {
        const queryClient = getQueryClient()
        const { rerender } = render(createTree())

        seedCache(queryClient)

        await act(() => {
            rerender(createTree())
        })

        expectCacheIntact(queryClient)
    })

    it('does not clear cache when signing in (null → userId)', async () => {
        mockController = mockSignOutBehavior(null)
        const queryClient = getQueryClient()
        const { rerender } = render(createTree())

        seedCache(queryClient)

        // Simulate sign-in: userId transitions from null to a real user
        mockController.setUserId('user_new456')
        await act(() => {
            rerender(createTree())
        })

        expectCacheIntact(queryClient)
    })

    it('clears cache when switching between different users', async () => {
        const queryClient = getQueryClient()
        const { rerender } = render(createTree())

        seedCache(queryClient)

        // Simulate direct user switch: user_mock123 → user_other789
        mockController.setUserId('user_other789')
        await act(() => {
            rerender(createTree())
        })

        await waitFor(() => {
            expectCacheCleared(queryClient)
        })
    })
})
