import type { Metadata } from 'next'
import { type ReactNode } from 'react'

// page.tsx is a client component, which cannot export metadata.
export const metadata: Metadata = { title: 'Sign in' }

export default function Layout({ children }: Readonly<{ children: ReactNode }>) {
    return children
}
