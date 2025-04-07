
import { AppLayout } from '@/components/layout/app-layout'
import { type ReactNode } from 'react'


export default async function ResearcherLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <AppLayout>{children}</AppLayout>
}
