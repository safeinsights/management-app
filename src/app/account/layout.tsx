import { AnonLayout } from '@/components/layout/anon-layout'
import { type ReactNode } from 'react'

export default async function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
    const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || ''

    return <AnonLayout clerkPublishableKey={key}>{children}</AnonLayout>
}
