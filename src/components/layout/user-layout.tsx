'use server'

import { ClerkProvider } from '@clerk/nextjs'
import { AppShell } from './app-shell'
import { ReactNode } from 'react'

type Props = {
    children: ReactNode
}

export async function UserLayout({ children }: Props) {
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

    return (
        <ClerkProvider
            publishableKey={key}
            // Workaround/hack: Use Clerk's localization feature to rename the default
            // "Personal account" text in the OrganizationSwitcher to "Researcher Account"
            // for better contextual clarity in our use case.
            localization={{
                organizationSwitcher: {
                    personalWorkspace: 'Researcher Account',
                },
            }}
        >
            <AppShell>{children}</AppShell>
        </ClerkProvider>
    )
}
