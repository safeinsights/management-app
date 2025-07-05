'use client'

import { ErrorPanel } from '@/components/panel'
import { useAuth } from '@clerk/nextjs'

export const SignOutPanel = () => {
    const { signOut } = useAuth()

    return (
        <ErrorPanel title="You must be signed out to accept invitations" onContinue={() => signOut(() => {}, {})}>
            Signout to continue
        </ErrorPanel>
    )
}
