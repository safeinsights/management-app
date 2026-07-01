'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useClerk, useUser } from '@clerk/nextjs'
import { Routes } from '@/lib/routes'
import { safeRedirectUrl } from '@/lib/utils'

export type AlreadySignedInStatus = 'loading' | 'signed-in' | 'signed-out'

export interface UseAlreadySignedIn {
    status: AlreadySignedInStatus
    email: string | null
    isSwitching: boolean
    continueToApp: () => void
    switchAccount: () => Promise<void>
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
        if (!isLoaded) return
        setStatus((current) => (current === 'loading' ? (isSignedIn ? 'signed-in' : 'signed-out') : current))
    }, [isLoaded, isSignedIn])

    const continueToApp = useCallback(() => {
        router.replace(safeRedirectUrl(searchParams.get('redirect_url'), Routes.dashboard))
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
