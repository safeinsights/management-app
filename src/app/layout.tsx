'use server'

import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@clerk/nextjs/server'

import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from './providers'
import { AppLayout } from '@/components/layout/app-layout'
import { type ReactNode } from 'react'

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
    const user = await currentUser()
    if (user?.twoFactorEnabled === false) {
        redirect('/account/mfa')
    }

    return (
        <html lang="en">
            <body>
                <Providers>
                    <AppLayout>{children}</AppLayout>
                </Providers>
            </body>
        </html>
    )
}
