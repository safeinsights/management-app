'use client'

import { ErrorPanel } from '@/components/panel'
import { FocusedCard } from '@/components/layout/focused-card'
import { useSignOut } from '@/hooks/use-sign-out'
import { usePathname } from 'next/navigation'

export const SignOutPanel = () => {
    // usePathname, not window.location: this client component is also server-rendered.
    const pathname = usePathname()
    const signOut = useSignOut({ redirectAfterSignOut: pathname ?? '/' })

    return (
        <FocusedCard>
            <ErrorPanel title="You must be signed out to accept invitations" onContinue={signOut}>
                Sign out to continue
            </ErrorPanel>
        </FocusedCard>
    )
}
