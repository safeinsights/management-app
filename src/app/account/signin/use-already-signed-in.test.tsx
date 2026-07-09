import { renderHook, act, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUser, useClerk } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import { useAlreadySignedIn } from './use-already-signed-in'

const mockSignedInUser = (email: string | null = 'ada@example.com') =>
    (useUser as Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: email ? { primaryEmailAddress: { emailAddress: email } } : {},
    })

describe('useAlreadySignedIn', () => {
    beforeEach(() => {
        memoryRouter.setCurrentUrl('/account/signin')
    })

    it('reports loading until Clerk has loaded', () => {
        ;(useUser as Mock).mockReturnValue({ isLoaded: false, isSignedIn: undefined, user: undefined })

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('loading')
    })

    it('latches signed-in when a session is active and no redirect_url is present', () => {
        mockSignedInUser('ada@example.com')

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-in')
        expect(result.current.email).toBe('ada@example.com')
        expect(memoryRouter.asPath).toBe('/account/signin')
    })

    it('auto-redirects when a session is active and a safe redirect_url is present', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('redirecting')
        expect(memoryRouter.asPath).toBe('/openstax/dashboard')
    })

    it('shows the prompt instead of auto-redirecting when redirect_url is unsafe', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=https%3A%2F%2Fevil.example')
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-in')
        expect(memoryRouter.asPath).toBe('/account/signin?redirect_url=https%3A%2F%2Fevil.example')
    })

    it('shows the prompt instead of looping when redirect_url points back at signin', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Faccount%2Fsignin')
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-in')
    })

    it('latches signed-out when no session is active on load', () => {
        ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false, user: null })

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-out')
        expect(result.current.email).toBeNull()
    })

    it('continueToApp falls back to the dashboard without a trustworthy redirect_url', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Faccount%2Fsignin')
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())
        act(() => result.current.continueToApp())

        expect(memoryRouter.asPath).toBe(Routes.dashboard)
    })

    it('switchAccount signs out and then reveals the form', async () => {
        const signOut = vi.fn().mockResolvedValue(undefined)
        ;(useClerk as Mock).mockReturnValue({ signOut, openUserProfile: vi.fn() })
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())
        await act(async () => {
            await result.current.switchAccount()
        })

        expect(signOut).toHaveBeenCalledOnce()
        expect(result.current.status).toBe('signed-out')
        expect(result.current.isSwitching).toBe(false)
    })
})
