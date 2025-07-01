import { UserLayout } from '@/components/layout/user-layout'
import { type ReactNode } from 'react'

export default async function AccountAuthLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <UserLayout>{children}</UserLayout>
}
