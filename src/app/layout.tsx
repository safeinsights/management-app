'use server'

import type { Metadata } from 'next'

import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from './providers'
import { AppLayout } from '@/components/layout/app-layout'
import { RequireMFA } from '@/components/require-mfa'
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
    return (
        <html lang="en">
            <body>
                <Providers>
                    <AppLayout>
                        {children}
                        <RequireMFA />
                    </AppLayout>
                </Providers>
            </body>
        </html>
    )
}
