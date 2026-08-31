import { renderHook, act, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUser, useClerk } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import posthog from 'posthog-js'
import { useAlreadySignedIn } from './use-already-signed-in'

const mockSignedInUser = (email: string | null = 'ada@example.com') =>
    (useUser as Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: email ? { primaryEmailAddress: { emailAddress: email } } : {},
    })

const mockSignedOutUser = () => (useUser as Mock).mockReturnValue({ isLoaded: true, isSignedIn: false, user: null })

// continueToApp leaves the SPA on purpose (OTTER-745), so the assertion target is the real
// navigation call rather than the in-memory router.
const spyOnHardNavigation = () => vi.spyOn(window.location, 'replace').mockImplementation(() => {})

// Mirrors the key leaveForApp writes: each exit leaves a note so the next mount can tell a proxy
// bounce from a first arrival (OTTER-745). Every hard navigation writes one, so seed it per test.
const EXIT_ATTEMPT_KEY = 'already-signed-in-exit-attempt'
const noteExitAttempt = (at = Date.now()) => sessionStorage.setItem(EXIT_ATTEMPT_KEY, String(at))

describe('useAlreadySignedIn', () => {
    beforeEach(() => {
        memoryRouter.setCurrentUrl('/account/signin')
        sessionStorage.clear()
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

    // OTTER-745: a soft auto-redirect was bounced back to this same URL by the proxy whenever the
    // session was alive only on the client. Next preserves the component across that bounce, so
    // hasRedirectedRef blocked a retry and the page held its loader for as long as Clerk stayed stale.
    // The asPath assertion pins the redirect to a full load: the in-memory router must not move.
    it('auto-redirects when a session is active and a safe redirect_url is present', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('redirecting')
        expect(navigate).toHaveBeenCalledWith('/openstax/dashboard')
        expect(memoryRouter.asPath).toBe('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
    })

    // OTTER-745: the automatic redirect exits through a full page load, so hasRedirectedRef is reset by
    // the bounce it is meant to survive. Without a note left behind, a client that keeps claiming a
    // session the proxy refuses would spin one document load per pass instead of sticking on one page.
    it('shows the form instead of auto-redirecting again when the proxy bounced the last exit back', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
        noteExitAttempt()
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-out')
        expect(navigate).not.toHaveBeenCalled()
    })

    it('auto-redirects when the last exit note is too old to be a bounce', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
        noteExitAttempt(Date.now() - 60_000)
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('redirecting')
        expect(navigate).toHaveBeenCalledWith('/openstax/dashboard')
    })

    it('auto-redirects when the last exit note is dated in the future', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard')
        noteExitAttempt(Date.now() + 60_000)
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('redirecting')
        expect(navigate).toHaveBeenCalledWith('/openstax/dashboard')
    })

    it('notes the exit it makes so the next mount can recognize a bounce', () => {
        mockSignedInUser()
        spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())
        act(() => result.current.continueToApp())

        expect(Date.now() - Number(sessionStorage.getItem(EXIT_ATTEMPT_KEY))).toBeLessThan(1000)
    })

    // The note only ever suppresses the automatic redirect. Without a redirect_url there is nothing to
    // suppress, so a warm note must not hide the prompt from a user who came to this page on purpose.
    it('still shows the prompt after a bounce when no redirect_url came back with it', () => {
        noteExitAttempt()
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-in')
        expect(navigate).not.toHaveBeenCalled()
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
        mockSignedOutUser()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-out')
        expect(result.current.email).toBeNull()
    })

    // OTTER-745: the prompt used to latch 'signed-in' for good, so it stayed on screen after Clerk
    // dropped the session and its Continue button could only bounce off the proxy.
    it('reveals the form when the session is lost after latching signed-in', () => {
        mockSignedInUser()

        const { result, rerender } = renderHook(() => useAlreadySignedIn())
        expect(result.current.status).toBe('signed-in')

        mockSignedOutUser()
        rerender()

        expect(result.current.status).toBe('signed-out')
        expect(result.current.email).toBeNull()
    })

    it('reveals the form when the session is lost while redirecting', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fdashboard')
        mockSignedInUser()
        spyOnHardNavigation()

        const { result, rerender } = renderHook(() => useAlreadySignedIn())
        expect(result.current.status).toBe('redirecting')

        mockSignedOutUser()
        rerender()

        expect(result.current.status).toBe('signed-out')
    })

    it('keeps the prompt closed when a sign-in completes through the form', () => {
        mockSignedOutUser()

        const { result, rerender } = renderHook(() => useAlreadySignedIn())
        expect(result.current.status).toBe('signed-out')

        mockSignedInUser()
        rerender()

        expect(result.current.status).toBe('signed-out')
    })

    // A trustworthy target auto-redirects, so the prompt only ever sees one that arrived later: the
    // proxy appends redirect_url when it bounces a dead session off a protected route (OTTER-745).
    it('continueToApp hard-navigates to a redirect_url that arrived after the prompt opened', () => {
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result, rerender } = renderHook(() => useAlreadySignedIn())
        expect(result.current.status).toBe('signed-in')

        act(() => memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fopenstax%2Fdashboard'))
        rerender()
        act(() => result.current.continueToApp())

        expect(navigate).toHaveBeenCalledWith('/openstax/dashboard')
    })

    it('continueToApp falls back to the dashboard without a trustworthy redirect_url', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Faccount%2Fsignin')
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())
        act(() => result.current.continueToApp())

        expect(navigate).toHaveBeenCalledWith(Routes.dashboard)
    })

    it('switchAccount resets posthog, signs out, and reveals the form', async () => {
        const signOut = vi.fn().mockResolvedValue(undefined)
        ;(useClerk as Mock).mockReturnValue({ signOut, openUserProfile: vi.fn() })
        const resetPosthog = vi.spyOn(posthog, 'reset').mockImplementation(() => posthog)
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())
        await act(async () => {
            await result.current.switchAccount()
        })

        expect(resetPosthog).toHaveBeenCalledOnce()
        expect(signOut).toHaveBeenCalledOnce()
        expect(result.current.status).toBe('signed-out')
        expect(result.current.isSwitching).toBe(false)
    })
})
