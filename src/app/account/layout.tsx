import { ClerkProvider } from '@clerk/nextjs'
import { type ReactNode } from 'react'

export default async function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
    return <ClerkProvider>{children}</ClerkProvider>
}
