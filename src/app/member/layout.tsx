'use server'

import React, { ReactNode } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { RequireReviewerKeys } from '@/components/require-reviewer-keys'

export default async function MemberLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {

    return (
        <AppLayout>
            <RequireReviewerKeys />
            {children}
        </AppLayout>
    )
}
