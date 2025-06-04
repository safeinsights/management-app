import React, { ReactNode } from 'react'
import { UserLayout } from '@/components/layout/user-layout'

export default function OrganizationLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    return <UserLayout>{children}</UserLayout>
}
