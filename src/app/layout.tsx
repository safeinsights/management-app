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
import { HydrationMarker } from '@/components/layout/hydration-marker'
import { RouteFocusManager } from '@/components/layout/route-focus-manager'
import { connection } from 'next/server'

const APP_TITLE = 'SafeInsights'

export async function generateMetadata(): Promise<Metadata> {
    return {
        // Each page names itself; the default only shows where none does (not-found, errors).
        title: { default: APP_TITLE, template: `%s - ${APP_TITLE}` },
        description: 'Manages studies, members, and data',
        icons: {
            icon: '/icon.png',
        },
        other: {
            google: 'notranslate',
        },
    }
}

// `connection()` here opts the whole app out of static generation so every document can carry the
// CSP nonce on its inline hydration scripts (OTTER-721).
export default async function RootLayout({
    children,
}: Readonly<{
    children: ReactNode
}>) {
    await connection()
    const postHogProjectToken = (await getConfigValue('POSTHOG_PROJECT_TOKEN', false)) ?? ''

    return (
        <html lang="en" translate="no" className={globalFont.className}>
            <body>
                <Providers singleUserEditing={SINGLE_USER_EDITING} posthogProjectToken={postHogProjectToken}>
                    <Suspense fallback={<GlobalLoading />}>
                        {children}
                        <HydrationMarker />
                    </Suspense>
                    <RouteFocusManager />
                    <PiSymbol />
                </Providers>
            </body>
        </html>
    )
}
