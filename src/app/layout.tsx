import type { Metadata } from 'next'

import './globals.css'
import '@mantine/core/styles.css'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
    title: 'SafeInsights Management Application',
    description: 'Manages studies, members, and data',
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="en">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    )
}
