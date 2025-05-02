import React, { ReactNode } from 'react'
import { UserLayout } from '@/components/layout/user-layout'
import { RequireReviewerKeys } from '@/components/require-reviewer-keys'

export default function ReviewerLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    return (
        <UserLayout>
            <RequireReviewerKeys />
            {children}
        </UserLayout>
    )
}
