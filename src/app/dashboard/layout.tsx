'use server'

import { ErrorAlert } from '@/components/errors'
import { AppShell } from '@/components/layout/app-shell'
import SentryUserProvider from '@/components/sentry-user-provider'
import { ClerkProvider } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { connection } from 'next/server'

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
    await connection() // force server rendering so we can access env vars
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    const user = await currentUser()
    if (user && user.twoFactorEnabled === false) {
        redirect('/account/mfa')
    }

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <SentryUserProvider />
            <AppShell>{children}</AppShell>
        </ClerkProvider>
    )
}
