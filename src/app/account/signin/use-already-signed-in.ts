'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import type { Route } from 'next'
import { reportError } from '@/components/errors'
import { DOWNLOAD_PREFIX } from '@/lib/paths'
import { Routes } from '@/lib/routes'
import { BOUNCE_PARAM, BOUNCE_VALUE } from '@/lib/signin-bounce'
import { safeRedirectUrl } from '@/lib/utils'
import posthog from 'posthog-js'

export type AlreadySignedInStatus = 'loading' | 'redirecting' | 'signed-in' | 'signed-out'

export interface UseAlreadySignedIn {
    status: AlreadySignedInStatus
    email: string | null
    isSwitching: boolean
    continueToApp: () => void
    switchAccount: () => Promise<void>
}

// A trusted target lets us send a signed-in user onward without prompting; anything
// ambiguous (absent, unsafe, or pointing back at signin, which would loop) gets null
// so the caller falls back to the continue/switch prompt.
//
// Downloads are excluded for a different reason than the unsafe ones: the target is legitimate, but
// it answers with an attachment instead of a document, so navigating there never replaces this page.
// The download would start behind a loader that has nothing left to wait for.
function trustedRedirectTarget(searchParams: ReadonlyURLSearchParams): Route | null {
    const raw = searchParams.get('redirect_url')
    if (!raw) return null
    const sanitized = safeRedirectUrl(raw, Routes.dashboard)
    if (sanitized !== raw || sanitized.startsWith(Routes.accountSignin)) return null
    if (sanitized.startsWith(DOWNLOAD_PREFIX)) return null
    return sanitized
}

// Both exits from this page leave the SPA instead of soft-navigating. A soft navigation to a
// protected route gets bounced by the proxy back to this same URL whenever the session is alive only
// on the client; the URL and route segment are unchanged, so Next keeps this component mounted with
// its state, and the page sticks: a Continue button that does nothing, or a permanent loader if the
// automatic redirect was mid-flight. A full load re-reads cookies, so the user lands either on the
// target or on the sign-in form (OTTER-745).
//
// replace, not assign: keeps signin out of history, matching the router.replace this supersedes.
// Otherwise Back would land here and redirect forward again for a live session.
function leaveForApp(target: Route) {
    window.location.replace(target)
}

// The proxy marks the signin redirect it issues, and it issues one only when the server refused the
// session. So the mark is the server's own answer about this arrival: the session behind it is not
// usable, whatever Clerk still reports locally. Nothing here has to time or guess that.
//
// It replaces the sessionStorage note this used to keep. The note timed each exit against the clock to
// guess whether the proxy had sent it back, and the guess failed both ways: a round trip slower than
// the window read as a first arrival and the redirect fired again, while an exit that succeeded left a
// note that misread the next visit inside the window as a refusal. The mark also costs nothing where
// web storage is blocked, and saves a round trip, since the form now appears on the first arrival
// rather than after a wasted pass.
function hasProxyBounceMark(searchParams: ReadonlyURLSearchParams): boolean {
    return searchParams.get(BOUNCE_PARAM) === BOUNCE_VALUE
}

// Offline, Clerk's signOut promise never settles: it neither resolves nor rejects, so awaiting it
// bare leaves switchAccount's catch and finally unreachable and the panel keeps its spinner with no
// exit (OTTER-745). Racing a timer is what makes the failure reachable.
//
// race attaches handlers to both promises, so a signOut that rejects after the timer already won is
// consumed here rather than escaping as an unhandled rejection.
export const SIGN_OUT_TIMEOUT_MS = 5_000

function signOutOrTimeout(signOut: () => Promise<unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined
    const expiry = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error('Signing out took too long. Your connection may be down.')),
            SIGN_OUT_TIMEOUT_MS,
        )
    })
    return Promise.race([signOut(), expiry]).finally(() => clearTimeout(timer))
}

// Latched on first load so a sign-in completed through the form doesn't re-open the prompt. The
// latch is one-directional: losing the session afterward always drops back to the form.
export function useAlreadySignedIn(): UseAlreadySignedIn {
    const { isLoaded, isSignedIn, user } = useUser()
    const { signOut } = useClerk()
    const searchParams = useSearchParams()

    const [status, setStatus] = useState<AlreadySignedInStatus>('loading')
    const [isSwitching, setIsSwitching] = useState(false)
    const [redirectTarget, setRedirectTarget] = useState<Route | null>(null)
    const hasRedirectedRef = useRef(false)

    // Resolve the one-time landing status as soon as Clerk finishes loading. Done
    // during render (rather than in an effect) so it doesn't trigger a cascading
    // re-render; the `status === 'loading'` guard latches it, and switchAccount
    // overrides it afterward. The redirect target is captured here so the navigation
    // effect below fires exactly once and does not re-read the (post-navigation)
    // search params.
    if (isLoaded && status === 'loading') {
        if (!isSignedIn) {
            setStatus('signed-out')
        } else {
            const target = trustedRedirectTarget(searchParams)
            if (!target) {
                setStatus('signed-in')
            } else if (hasProxyBounceMark(searchParams)) {
                // Sending the user back to a target the server just refused would only bounce again.
                // The prompt is not the answer either, because its Continue goes to that same target,
                // so the form is the one exit that ends the round trip.
                setStatus('signed-out')
            } else {
                setRedirectTarget(target)
                setStatus('redirecting')
            }
        }
    }

    // Reveal the form when Clerk drops the session after the latch. The latch above is one-shot for
    // false -> true on purpose; true -> false is the opposite case and is never ambiguous: the prompt
    // is stale (OTTER-745). This is the tidy recovery, not the guarantee: it depends on Clerk having
    // noticed. Clerk documents 60s tokens, a ~50s background refresh, stale resources in between, and
    // getToken({ skipCache: true }) to force a sync. What it does not promise is any upper bound on how
    // long client state stays stale, and backgrounding or lost connectivity delay the sync that would
    // end it. So leaveForApp, below, is the guarantee: it never depends on Clerk's sync timing.
    if (isLoaded && !isSignedIn && (status === 'signed-in' || status === 'redirecting')) {
        setStatus('signed-out')
    }

    // Perform the actual navigation once we've latched into the redirecting state. The status guard
    // covers every real dep change (the only one is the signed-out downgrade); the ref only stops
    // StrictMode's dev-only effect re-invocation from navigating twice.
    useEffect(() => {
        if (status !== 'redirecting' || !redirectTarget || hasRedirectedRef.current) return
        hasRedirectedRef.current = true
        leaveForApp(redirectTarget)
    }, [status, redirectTarget])

    const continueToApp = useCallback(() => {
        leaveForApp(trustedRedirectTarget(searchParams) ?? Routes.dashboard)
    }, [searchParams])

    // Two places write 'signed-out' after the latch, and they cover different cases: the downgrade
    // above needs Clerk to have flipped isSignedIn, while this one reaches the form however the
    // sign-out ends, because that is what the user asked for. The three endings are a clean resolve,
    // a rejection, and no answer at all; the timeout is what turns the third into the second.
    // What keeps the two writers from diverging is that every post-latch write moves status the same
    // direction: toward 'signed-out'. Nothing re-opens the prompt.
    const switchAccount = useCallback(async () => {
        setIsSwitching(true)
        try {
            posthog.reset()
            await signOutOrTimeout(signOut)
        } catch (error) {
            // The button awaits nothing, so a rejection escaping here would land as an unhandled
            // rejection, and a session the server has already dropped is where Clerk is most likely
            // to reject. Reaching the form is what the user asked for; the finally below does that.
            reportError(error, 'Failed to sign out while switching accounts')
        } finally {
            setIsSwitching(false)
            setStatus('signed-out')
        }
    }, [signOut])

    return {
        status,
        email: user?.primaryEmailAddress?.emailAddress ?? null,
        isSwitching,
        continueToApp,
        switchAccount,
    }
}
