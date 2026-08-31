'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
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
function trustedRedirectTarget(searchParams: ReadonlyURLSearchParams): Route | null {
    const raw = searchParams.get('redirect_url')
    if (!raw) return null
    const sanitized = safeRedirectUrl(raw, Routes.dashboard)
    if (sanitized !== raw || sanitized.startsWith(Routes.accountSignin)) return null
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
    recordExitAttempt()
    window.location.replace(target)
}

// Leaving through a full load is what makes this page recoverable, but it also means hasRedirectedRef
// cannot bound the automatic redirect: a proxy bounce arrives as a fresh mount with the ref reset, so
// the redirect fires again. Clerk documents that its SDK revalidates auth state against its API after a
// page load, which is why that second pass normally sees the dead session and reaches the form by
// itself. What is not documented is what the client reports when the revalidation cannot finish
// (offline, or a handshake that fails), and a client that keeps claiming a session the proxy refuses
// would spin one document load per pass. So each exit leaves a note behind, and arriving here to a
// still-warm note means the proxy refused that exit: the session is gone, show the form. Same
// conclusion as the downgrade below, drawn from the proxy's answer rather than from Clerk's.
//
// The note holds the time and nothing else. Which target was refused would add nothing to the decision,
// since a bounce always returns carrying the same target it just refused, and keeping request paths out
// of web storage costs us no precision here.
const EXIT_ATTEMPT_KEY = 'already-signed-in-exit-attempt'

// One bounce is a single redirect round trip, so a short window separates it from an unrelated later
// visit to this page in the same tab, which should still auto-redirect normally.
const EXIT_BOUNCE_WINDOW_MS = 15_000

// sessionStorage throws rather than returning null where storage is blocked, and is absent server-side.
// Losing the guard there is better than losing the navigation, so both helpers fall back to the
// unguarded behavior.
function recordExitAttempt() {
    try {
        sessionStorage.setItem(EXIT_ATTEMPT_KEY, String(Date.now()))
    } catch {
        // Nothing to do: the note is a safeguard, and the navigation still has to happen without it.
    }
}

function hasRecentExitAttempt(): boolean {
    try {
        const note = sessionStorage.getItem(EXIT_ATTEMPT_KEY)
        if (!note) return false
        // A non-numeric note yields NaN, and every NaN comparison is false, so it reads as no bounce.
        return Date.now() - Number(note) < EXIT_BOUNCE_WINDOW_MS
    } catch {
        return false
    }
}

// The note is external mutable state, and useSyncExternalStore is what React provides for sampling that
// during render without breaking purity. Nothing to subscribe to: the only writer is leaveForApp, which
// leaves the document in the same breath, and the server has no storage to read.
const subscribeToNothing = () => () => {}
const noBounceOnServer = () => false

// Latched on first load so a sign-in completed through the form doesn't re-open the prompt. The
// latch is one-directional: losing the session afterward always drops back to the form.
export function useAlreadySignedIn(): UseAlreadySignedIn {
    const { isLoaded, isSignedIn, user } = useUser()
    const { signOut } = useClerk()
    const searchParams = useSearchParams()

    const hasBouncedBack = useSyncExternalStore(subscribeToNothing, hasRecentExitAttempt, noBounceOnServer)

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
            } else if (hasBouncedBack) {
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

    // Two places write 'signed-out' after the latch, and they cover different cases: the downgrade above
    // needs Clerk to have flipped isSignedIn, while this one runs even when signOut rejects or Clerk holds
    // on to the session, because a user who asked to switch accounts should reach the form either way.
    // What keeps them from diverging is that every post-latch write moves status the same direction:
    // toward 'signed-out'. Nothing re-opens the prompt.
    const switchAccount = useCallback(async () => {
        setIsSwitching(true)
        try {
            posthog.reset()
            await signOut()
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
