'use server'

import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'
import Script from 'next/script'

const globalFont = Open_Sans({
    subsets: ['latin'],
})

import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from '@/components/layout/providers'
import { type ReactNode } from 'react'
import { PiSymbol } from '../components/pi-symbol'

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
    const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || ''

    return (
        <html lang="en" className={globalFont.className}>
            <body>
                <Script
                    id="sentry-dsn"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `
                            window.SENTRY_DSN = ${JSON.stringify(sentryDsn)};
                        `,
                    }}
                />
                <Providers>{children}</Providers>
                <PiSymbol />
            </body>
        </html>
    )
}
