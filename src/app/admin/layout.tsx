
import { AppLayout } from '@/components/layout/app-layout'
import { type ReactNode } from 'react'

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <AppLayout>{children}</AppLayout>
}
