import { FocusedLayout } from '@/components/layout/focused-layout'
import { type ReactNode } from 'react'

export default async function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <FocusedLayout>{children}</FocusedLayout>
}
