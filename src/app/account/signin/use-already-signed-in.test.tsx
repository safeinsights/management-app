import { renderHook, act, type Mock } from '@/tests/unit.helpers'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useUser, useClerk } from '@clerk/nextjs'
import { memoryRouter } from 'next-router-mock'
import { Routes } from '@/lib/routes'
import { BOUNCE_PARAM, BOUNCE_VALUE } from '@/lib/signin-bounce'
import posthog from 'posthog-js'
import { SIGN_OUT_TIMEOUT_MS, useAlreadySignedIn } from './use-already-signed-in'

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

// What the proxy sends back when it refuses a session: the captured target plus the mark that says
// the refusal came from the server (OTTER-745). Built from the constants so the test cannot drift.
const refusedArrival = (target = '%2Fopenstax%2Fdashboard') =>
    `/account/signin?redirect_url=${target}&${BOUNCE_PARAM}=${BOUNCE_VALUE}`

describe('useAlreadySignedIn', () => {
    beforeEach(() => {
        memoryRouter.setCurrentUrl('/account/signin')
    })

    // Only the timeout test below runs on fake timers; this is a no-op for the rest.
    afterEach(() => {
        vi.useRealTimers()
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
    // the bounce it is meant to survive, and a client that keeps claiming a session the proxy refuses
    // would spin one document load per pass. The mark on the URL is the server's answer about this
    // arrival, so the form is reached without another pass.
    it('shows the form instead of auto-redirecting when the proxy marked this arrival as refused', () => {
        memoryRouter.setCurrentUrl(refusedArrival())
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-out')
        expect(navigate).not.toHaveBeenCalled()
    })

    // The mark is read per arrival instead of timed, so a slow Clerk cannot age it out of a window the
    // way the sessionStorage note it replaced could: loading slowly is one of the cases it exists for.
    it('keeps the refusal when Clerk loads long after the arrival', () => {
        memoryRouter.setCurrentUrl(refusedArrival())
        ;(useUser as Mock).mockReturnValue({ isLoaded: false, isSignedIn: undefined, user: undefined })
        const navigate = spyOnHardNavigation()

        const { result, rerender } = renderHook(() => useAlreadySignedIn())
        expect(result.current.status).toBe('loading')

        mockSignedInUser()
        rerender()

        expect(result.current.status).toBe('signed-out')
        expect(navigate).not.toHaveBeenCalled()
    })

    // The mark only ever suppresses the automatic redirect. Without a redirect_url there is nothing to
    // suppress, so it must not hide the prompt from a user who came to this page on purpose.
    it('still shows the prompt when a marked arrival carries no redirect_url', () => {
        memoryRouter.setCurrentUrl(`/account/signin?${BOUNCE_PARAM}=${BOUNCE_VALUE}`)
        mockSignedInUser()
        const navigate = spyOnHardNavigation()

        const { result } = renderHook(() => useAlreadySignedIn())

        expect(result.current.status).toBe('signed-in')
        expect(navigate).not.toHaveBeenCalled()
    })

    // A download answers with an attachment rather than a document, so navigating there would leave
    // this page mounted behind a loader with nothing left to wait for (OTTER-745).
    it('shows the prompt instead of auto-redirecting to a download', () => {
        memoryRouter.setCurrentUrl('/account/signin?redirect_url=%2Fdl%2Fscan-log%2Fjob-1')
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

    // The switch button awaits nothing, so a rejection has to be handled here or it escapes as an
    // unhandled rejection, and a session the server has already dropped is exactly where Clerk's
    // signOut is most likely to fail. The user asked for the form either way.
    it('switchAccount reveals the form even when signOut rejects', async () => {
        const signOut = vi.fn().mockRejectedValue(new Error('session already gone'))
        ;(useClerk as Mock).mockReturnValue({ signOut, openUserProfile: vi.fn() })
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())
        await act(async () => {
            await result.current.switchAccount()
        })

        expect(result.current.status).toBe('signed-out')
        expect(result.current.isSwitching).toBe(false)
    })

    // OTTER-745: rejecting and never settling are different failures, and only the first was
    // covered. Offline this left the user on a spinner with no way off the panel.
    it('switchAccount reveals the form even when signOut never settles', async () => {
        vi.useFakeTimers()
        const signOut = vi.fn().mockReturnValue(new Promise<void>(() => {}))
        ;(useClerk as Mock).mockReturnValue({ signOut, openUserProfile: vi.fn() })
        mockSignedInUser()

        const { result } = renderHook(() => useAlreadySignedIn())
        let switching: Promise<void> | undefined
        act(() => {
            switching = result.current.switchAccount()
        })
        expect(result.current.isSwitching).toBe(true)

        await act(async () => {
            await vi.advanceTimersByTimeAsync(SIGN_OUT_TIMEOUT_MS)
            await switching
        })

        expect(result.current.status).toBe('signed-out')
        expect(result.current.isSwitching).toBe(false)
    })
})
