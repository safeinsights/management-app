'use server'

import { ClerkProvider } from '@clerk/nextjs'
import { AppShell } from './app-shell'
import { LoadingOverlay } from '@mantine/core'
import { ReactNode } from 'react'
import { ErrorAlert } from '../errors'

type Props = {
    children: ReactNode
    showOverlay?: boolean
}

export async function UserLayout({ children, showOverlay = false }: Props) {
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    return (
        <ClerkProvider
            publishableKey={clerkPublishableKey}
            // Workaround/hack: Use Clerk's localization feature to rename the default
            // "Personal account" text in the OrganizationSwitcher to "Researcher Account"
            // for better contextual clarity in our use case.
            localization={{
                organizationSwitcher: {
                    personalWorkspace: 'Researcher Account',
                },
            }}
        >
            <AppShell>{showOverlay ? <LoadingOverlay visible /> : children}</AppShell>
        </ClerkProvider>
    )
}
