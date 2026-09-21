'use client'

import { semanticColor } from '@/theme/tokens'
import { ErrorPanel } from '@/components/panel'
import { useSignOut } from '@/hooks/use-sign-out'
import { Paper } from '@mantine/core'
import { usePathname } from 'next/navigation'

export const SignOutPanel = () => {
    // usePathname, not window.location: this client component is also server-rendered.
    const pathname = usePathname()
    const signOut = useSignOut({ redirectAfterSignOut: pathname ?? '/' })

    return (
        <Paper bg={semanticColor('surface.raised')} p="xxl" radius="sm" w={600}>
            <ErrorPanel title="You must be signed out to accept invitations" onContinue={signOut}>
                Sign out to continue
            </ErrorPanel>
        </Paper>
    )
}
