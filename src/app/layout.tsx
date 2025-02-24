import type { Metadata } from 'next'

import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from './providers'
import { AppLayout } from '@/components/layout/app-layout'
import { ReactNode } from 'react'

export const metadata: Metadata = {
    title: 'SafeInsights Management Application',
    description: 'Manages studies, members, and data',
    icons: {
        icon: '/icon.png',
    },
}

export default function RootLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
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
