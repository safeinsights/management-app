import { getReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { UserLayout } from '@/components/layout/user-layout'
import { AnonLayout } from '@/components/layout/anon-layout'
import { ReactNode } from 'react'
import { RegenerateKeys } from './regenerate-keys'

export default async function ReviewerKeysPageLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const publicKey = await getReviewerPublicKeyAction()

    if (publicKey) {
        // User has a key - show UserLayout
        return (
            <UserLayout>
                <RegenerateKeys />
            </UserLayout>
        )
    } else {
        // No key, first-time generation - show AnonLayout
        return <AnonLayout>{children}</AnonLayout>
    }
}
