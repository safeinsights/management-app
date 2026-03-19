import { ErrorAlert } from '@/components/errors'
import { ClerkProvider } from '@clerk/nextjs'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { type ReactNode } from 'react'
import { connection } from 'next/server'

export const dynamic = 'force-dynamic'

export default async function EditorDemoLayout({ children }: Readonly<{ children: ReactNode }>) {
    await connection()
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    const user = await currentUser()
    if (!user) {
        redirect('/account/signin')
    }

    return <ClerkProvider publishableKey={clerkPublishableKey}>{children}</ClerkProvider>
}
