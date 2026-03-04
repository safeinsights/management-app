'use client'

import { ErrorPanel } from '@/components/panel'
import { useClerk } from '@clerk/nextjs'
import { useCallback } from 'react'

export const SignOutPanel = () => {
    const { signOut } = useClerk()

    const handleSignOut = useCallback(async () => {
        await signOut({ redirectUrl: window.location.href })
    }, [signOut])

    return (
        <ErrorPanel title="You must be signed out to accept invitations" onContinue={handleSignOut}>
            Sign out to continue
        </ErrorPanel>
    )
}
