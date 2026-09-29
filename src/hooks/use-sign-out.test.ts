import { renderHook, createTestQueryWrapper, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { useClerk } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import posthog from 'posthog-js'
import { useSignOut } from './use-sign-out'

// next-router-mock implements the pages-router surface; refresh() is app-router only.
;(memoryRouter as unknown as { refresh: () => void }).refresh = vi.fn()

const mockClerkSignOut = (signOut: Mock) => (useClerk as Mock).mockReturnValue({ signOut })

const renderSignOut = (options?: { redirectAfterSignOut: string }) =>
    renderHook(() => useSignOut(options), { wrapper: createTestQueryWrapper() })

describe('useSignOut', () => {
    // OTTER-671: the next sign-in lands on the dashboard, not where the session ended.
    it('redirects to signin without a redirect_url', async () => {
        memoryRouter.setCurrentUrl('/openstax/study/123/review')
        const signOut = vi.fn().mockResolvedValue(undefined)
        mockClerkSignOut(signOut)

        const { result } = renderSignOut()
        await result.current()

        expect(signOut).toHaveBeenCalledWith({ redirectUrl: Routes.accountSignin })
        expect(memoryRouter.asPath).toBe(Routes.accountSignin)
    })

    it('honors an explicit redirectAfterSignOut destination', async () => {
        const signOut = vi.fn().mockResolvedValue(undefined)
        mockClerkSignOut(signOut)

        const { result } = renderSignOut({ redirectAfterSignOut: '/account/invitation/abc' })
        await result.current()

        expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/account/invitation/abc' })
        expect(memoryRouter.asPath).toBe('/account/invitation/abc')
    })

    it('still redirects when Clerk signOut rejects', async () => {
        memoryRouter.setCurrentUrl('/dashboard')
        const signOut = vi.fn().mockRejectedValue(new Error('clerk unavailable'))
        mockClerkSignOut(signOut)

        const { result } = renderSignOut()
        await result.current()

        expect(memoryRouter.asPath).toBe(Routes.accountSignin)
    })

    it('resets posthog identity before signing out', async () => {
        const signOut = vi.fn().mockResolvedValue(undefined)
        mockClerkSignOut(signOut)
        const resetSpy = vi.spyOn(posthog, 'reset').mockImplementation(() => posthog)

        const { result } = renderSignOut()
        await result.current()

        expect(resetSpy).toHaveBeenCalledOnce()
        expect(resetSpy.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0])
    })
})
