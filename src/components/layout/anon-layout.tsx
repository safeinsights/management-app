'use server'

import { ErrorAlert } from '../errors'
import SentryUserProvider from '../sentry-user-provider'
import { AnonLayoutShell } from './anon-layout-shell'
import { ClerkProvider } from '@clerk/nextjs'

type Props = {
    children: React.ReactNode
}

export async function AnonLayout({ children }: Props) {
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <SentryUserProvider />
            <AnonLayoutShell>{children}</AnonLayoutShell>
        </ClerkProvider>
    )
}
