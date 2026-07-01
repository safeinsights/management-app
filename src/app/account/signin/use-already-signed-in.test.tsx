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

    it('latches signed-in when a session is already active on load', () => {
        mockSignedInUser('ada@example.com')

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-in')
        expect(result.current.email).toBe('ada@example.com')
    })

    it('latches signed-out when no session is active on load', () => {
        ;(useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false, user: null })

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-out')
        expect(result.current.email).toBeNull()
    })

    it('continueToApp honors a safe redirect_url', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())
        act(() => result.current.continueToApp())

        expect(memoryRouter.asPath).toBe('/openstax/dashboard')
    })

    it('continueToApp falls back to the dashboard without a redirect_url', () => {
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
