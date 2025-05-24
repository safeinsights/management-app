import React, { ReactNode } from 'react'
import { UserLayout } from '@/components/layout/user-layout'
import { getReviewerPublicKeyAction } from '@/server/actions/user-keys.actions'
import { redirect } from 'next/navigation'

export default async function ReviewerLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const publicKey = await getReviewerPublicKeyAction()

    if (!publicKey) {
        redirect('/account/keys')
    }

    return <UserLayout>{children}</UserLayout>
}
