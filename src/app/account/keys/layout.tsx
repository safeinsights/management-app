import { getReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { ReactNode } from 'react'
import { RegenerateKeys } from './regenerate-keys'

export default async function ReviewerKeysPageLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const publicKey = await getReviewerPublicKeyAction()

    if (publicKey) {
        return <RegenerateKeys />
    } else {
        return <>{children}</>
    }
}
