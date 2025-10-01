'use server'

import { UserLayout } from '@/components/layout/user-layout'
import { type ReactNode } from 'react'

export default async function OrgLayout({ children }: Readonly<{ children: ReactNode }>) {
    // TODO: check user is a member of the org

    return <UserLayout>{children}</UserLayout>
}
