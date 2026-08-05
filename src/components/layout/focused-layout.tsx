'use server'

import { ErrorAlert } from '../errors'
import SentryUserProvider from '../sentry-user-provider'
import { FocusedLayoutShell } from './focused-layout-shell'
import { ClerkProvider } from '@clerk/nextjs'
import { connection } from 'next/server'
import { getCspNonce } from '@/lib/csp'

type Props = {
    children: React.ReactNode
}

export async function FocusedLayout({ children }: Props) {
    await connection() // force server rendering so we can access env vars
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''
    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    return (
        <ClerkProvider publishableKey={clerkPublishableKey} nonce={await getCspNonce()}>
            <SentryUserProvider />
            <FocusedLayoutShell>{children}</FocusedLayoutShell>
        </ClerkProvider>
    )
}
