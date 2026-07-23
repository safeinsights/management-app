'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import type { Route } from 'next'
import { Routes } from '@/lib/routes'
import { safeRedirectUrl } from '@/lib/utils'

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

// Latched on first load so a sign-in completed through the form doesn't re-open the prompt.
export function useAlreadySignedIn(): UseAlreadySignedIn {
    const { isLoaded, isSignedIn, user } = useUser()
    const { signOut } = useClerk()
    const router = useRouter()
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

    // Perform the actual navigation once we've latched into the redirecting state.
    // The ref makes this fire exactly once: the effect can re-run on unrelated
    // re-renders (e.g. an unstable router reference), and repeatedly calling
    // router.replace while status stays 'redirecting' would loop.
    useEffect(() => {
        if (status !== 'redirecting' || !redirectTarget || hasRedirectedRef.current) return
        hasRedirectedRef.current = true
        router.replace(redirectTarget)
    }, [status, redirectTarget, router])

    const continueToApp = useCallback(() => {
        router.replace(trustedRedirectTarget(searchParams) ?? Routes.dashboard)
    }, [router, searchParams])

    const switchAccount = useCallback(async () => {
        setIsSwitching(true)
        try {
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
