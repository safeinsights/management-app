import type { Metadata } from 'next'
import { Open_Sans } from 'next/font/google'

const globalFont = Open_Sans({
    subsets: ['latin'],
})

import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from '@/components/layout/providers'
import { SINGLE_USER_EDITING } from '@/server/config'
import { Suspense, type ReactNode } from 'react'
import { PiSymbol } from '../components/pi-symbol'
import { GlobalLoading } from '@/components/layout/global-loading'
import { connection } from 'next/server'

export async function generateMetadata(): Promise<Metadata> {
    return {
        title: 'SafeInsights Management Application',
        description: 'Manages studies, members, and data',
        icons: {
            icon: '/icon.png',
        },
        other: {
            google: 'notranslate',
        },
    }
}

// Rendered per-request so every document, including Next's own not-found entry, is generated at
// request time and can carry the CSP nonce on its inline hydration scripts. A `dynamic` export on
// not-found.tsx does not achieve this: Next prerenders that entry regardless (OTTER-721).
export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    await connection()

    return (
        <html lang="en" translate="no" className={globalFont.className}>
            <body>
                <Providers singleUserEditing={SINGLE_USER_EDITING}>
                    <Suspense fallback={<GlobalLoading />}>{children}</Suspense>
                    <PiSymbol />
                </Providers>
            </body>
        </html>
    )
}
