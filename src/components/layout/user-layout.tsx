'use server'

import { ClerkProvider } from '@clerk/nextjs'
import { AppShell } from './app-shell'
import { LoadingOverlay } from '@mantine/core'
import { ReactNode } from 'react'
import { ErrorAlert } from '../errors'
import SentryUserProvider from '../sentry-user-provider'

type Props = {
    children: ReactNode
    showOverlay?: boolean
}

export async function UserLayout({ children, showOverlay = false }: Props) {
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <SentryUserProvider />
            <AppShell>{showOverlay ? <LoadingOverlay visible /> : children}</AppShell>
        </ClerkProvider>
    )
}
