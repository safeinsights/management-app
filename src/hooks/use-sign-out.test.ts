import { renderHook, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi } from 'vitest'
import { useClerk } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import { useSignOut } from './use-sign-out'

const mockClerkSignOut = (signOut: Mock) => (useClerk as Mock).mockReturnValue({ signOut })

const spyOnLocationAssign = () => vi.spyOn(window.location, 'assign').mockImplementation(() => {})

describe('useSignOut', () => {
    // OTTER-671: signing out must never capture the current page — the next
    // sign-in always lands on the dashboard, not where the session ended.
    it('redirects to signin without a redirect_url', async () => {
        memoryRouter.setCurrentUrl('/openstax/study/123/review')
        const signOut = vi.fn().mockResolvedValue(undefined)
        mockClerkSignOut(signOut)
        const assign = spyOnLocationAssign()

        const { result } = renderHook(() => useSignOut())
        await result.current()

        expect(signOut).toHaveBeenCalled()
        expect(assign).toHaveBeenCalledWith(Routes.accountSignin)
        expect(assign.mock.calls[0][0]).not.toContain('redirect_url')
    })

    it('honors an explicit redirectAfterSignOut destination', async () => {
        const signOut = vi.fn().mockResolvedValue(undefined)
        mockClerkSignOut(signOut)
        const assign = spyOnLocationAssign()

        const { result } = renderHook(() => useSignOut({ redirectAfterSignOut: '/account/invitation/abc' }))
        await result.current()

        expect(assign).toHaveBeenCalledWith('/account/invitation/abc')
    })

    it('still redirects when Clerk signOut rejects', async () => {
        const signOut = vi.fn().mockRejectedValue(new Error('clerk unavailable'))
        mockClerkSignOut(signOut)
        const assign = spyOnLocationAssign()

        const { result } = renderHook(() => useSignOut())
        await result.current()

        expect(assign).toHaveBeenCalledWith(Routes.accountSignin)
    })
})
