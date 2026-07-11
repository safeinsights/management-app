'use client'

import { useCallback, useEffect, useState } from 'react'
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

    useEffect(() => {
        if (!isLoaded || status !== 'loading') return

        if (!isSignedIn) {
            setStatus('signed-out')
            return
        }

        const target = trustedRedirectTarget(searchParams)
        if (target) {
            setStatus('redirecting')
            router.replace(target)
            return
        }

        setStatus('signed-in')
    }, [isLoaded, isSignedIn, status, router, searchParams])

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
