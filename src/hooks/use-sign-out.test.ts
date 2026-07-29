import { renderHook, createTestQueryWrapper, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { useClerk } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import { useSignOut } from './use-sign-out'

// next-router-mock implements the pages-router surface; refresh() is app-router only.
;(memoryRouter as unknown as { refresh: () => void }).refresh = vi.fn()

const mockClerkSignOut = (signOut: Mock) => (useClerk as Mock).mockReturnValue({ signOut })

const renderSignOut = (options?: { redirectAfterSignOut: string }) =>
    renderHook(() => useSignOut(options), { wrapper: createTestQueryWrapper() })

describe('useSignOut', () => {
    // OTTER-671: signing out must never capture the current page — the next
    // sign-in always lands on the dashboard, not where the session ended.
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
})
