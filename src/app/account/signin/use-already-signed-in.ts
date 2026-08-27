'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
    window.location.replace(target)
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
            if (target) {
                setRedirectTarget(target)
                setStatus('redirecting')
            } else {
                setStatus('signed-in')
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
