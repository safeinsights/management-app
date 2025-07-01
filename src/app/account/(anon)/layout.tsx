import { AnonLayout } from '@/components/layout/anon-layout'
import { type ReactNode } from 'react'

export default async function AccountAnonLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <AnonLayout>{children}</AnonLayout>
}
