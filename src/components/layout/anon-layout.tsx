import { AnonLayoutShell } from './anon-layout-shell'
import { ClerkProvider } from '@clerk/nextjs'

type Props = {
    children: React.ReactNode
}

export function AnonLayout({ children }: Props) {
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <AnonLayoutShell>{children}</AnonLayoutShell>
        </ClerkProvider>
    )
}
