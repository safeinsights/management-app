'use client'

import { ErrorPanel } from '@/components/panel'
import { useSignOut } from '@/hooks/use-sign-out'
import { Paper } from '@mantine/core'

export const SignOutPanel = () => {
    const signOut = useSignOut({ redirectAfterSignOut: window.location.href })

    return (
        <Paper bg="white" p="xxl" radius="sm" w={600}>
            <ErrorPanel title="You must be signed out to accept invitations" onContinue={signOut}>
                Sign out to continue
            </ErrorPanel>
        </Paper>
    )
}
