'use client'

import { ErrorPanel } from '@/components/panel'
import { useSignOut } from '@/hooks/use-sign-out'

export const SignOutPanel = () => {
    const signOut = useSignOut()

    return (
        <ErrorPanel title="You must be signed out to accept invitations" onContinue={signOut}>
            Sign out to continue
        </ErrorPanel>
    )
}
