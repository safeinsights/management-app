'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import './globals.css'
import '@mantine/core/styles.layer.css'
import 'mantine-datatable/styles.layer.css'
import '@mantine/dropzone/styles.layer.css'

import { Providers } from './providers'
import { AppLayout } from '@/components/layout/app-layout'
import { useLayoutEffect, type ReactNode } from 'react'

export const Metadata = {
    title: 'SafeInsights Management Application',
    description: 'Manages studies, members, and data',
    icons: {
        icon: '/icon.png',
    },
}

const RequireMFA = () => {
    const { user } = useUser()
    const pathname = usePathname()
    const router = useRouter()

    useLayoutEffect(() => {
        if (user?.twoFactorEnabled === false && !pathname.startsWith('/account/mfa')) {
            router.push('/account/mfa')
        }
    }, [pathname])

    return null
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
                    <AppLayout>
                        {children}
                        <RequireMFA />
                    </AppLayout>
                </Providers>
            </body>
        </html>
    )
}
