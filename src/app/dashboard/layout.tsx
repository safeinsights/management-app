import { UserLayout } from '@/components/layout/user-layout'
import { type ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <UserLayout>{children}</UserLayout>
}
