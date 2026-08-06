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
import { getConfigValue, SINGLE_USER_EDITING } from '@/server/config'
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

export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    await connection() // force server rendering so we can access config vars
    const postHogProjectToken = (await getConfigValue('POSTHOG_PROJECT_TOKEN', false)) ?? ''

    return (
        <html lang="en" translate="no" className={globalFont.className}>
            <body>
                <Providers singleUserEditing={SINGLE_USER_EDITING} posthogProjectToken={postHogProjectToken}>
                    <Suspense fallback={<GlobalLoading />}>{children}</Suspense>
                    <PiSymbol />
                </Providers>
            </body>
        </html>
    )
}
