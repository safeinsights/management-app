import { UserLayout } from '@/components/layout/user-layout'
import { type ReactNode } from 'react'

export default function ResearcherLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <UserLayout>{children}</UserLayout>
}
