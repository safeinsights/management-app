'use client'

import { ErrorPanel } from '@/components/panel'
import { useSignOut } from '@/hooks/use-sign-out'
import { Paper } from '@mantine/core'
import { usePathname } from 'next/navigation'

export const SignOutPanel = () => {
    // usePathname, not window.location.href: this client component is also
    // server-rendered, and reading window during SSR crashes the whole route.
    const pathname = usePathname()
    const signOut = useSignOut({ redirectAfterSignOut: pathname ?? '/' })

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600}>
            <ErrorPanel title="You must be signed out to accept invitations" onContinue={signOut}>
                Sign out to continue
            </ErrorPanel>
        </Paper>
    )
}
