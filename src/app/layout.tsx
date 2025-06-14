'use server'

import type { Metadata } from 'next'

import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from './providers'
import { type ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'
import { ErrorAlert } from '@/components/errors'

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'SafeInsights Management Application',
        description: 'Manages studies, members, and data',
        icons: {
            icon: '/icon.png',
        },
    }
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    if (!clerkPublishableKey) return <ErrorAlert error={'missing clerk key'} />

    return (
        <ClerkProvider
            publishableKey={clerkPublishableKey}
            localization={{
                organizationSwitcher: {
                    personalWorkspace: 'Researcher Account',
                },
            }}
        >
            <html lang="en">
                <body>
                    <Providers>{children}</Providers>
                </body>
            </html>
        </ClerkProvider>
    )
}
