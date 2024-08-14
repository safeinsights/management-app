import type { Metadata } from 'next'

import './globals.css'
import '@mantine/core/styles.css'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
    title: 'SafeInsights App Template',
    description: 'An application',
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
