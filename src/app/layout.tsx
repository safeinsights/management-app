import type { Metadata } from 'next'

import './globals.css'

import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'

import { Providers } from './providers'
import { AppLayout } from '@/components/app-layout'


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
    children: React.ReactNode
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
