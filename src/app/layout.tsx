'use server'

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
    return (
        <html lang="en" className={globalFont.className}>
            <body>
                <Providers>{children}</Providers>
                <PiSymbol />
            </body>
        </html>
    )
}
