'use server'

import { ClerkProvider } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import { LoadingOverlay } from '@mantine/core'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { ErrorAlert } from '../errors'
import SentryUserProvider from '../sentry-user-provider'
import { AppShell } from './app-shell'
import { connection } from 'next/server'

type Props = {
    children: ReactNode
    showOverlay?: boolean
}

export async function UserLayout({ children, showOverlay = false }: Props) {
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
            <AppShell>{showOverlay ? <LoadingOverlay visible /> : children}</AppShell>
        </ClerkProvider>
    )
}
