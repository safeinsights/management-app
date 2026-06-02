'use client'

import { AppShell, AppShellHeader, AppShellMain, Group } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import '@mantine/notifications/styles.css'
import type { Route } from 'next'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { Routes } from '@/lib/routes'
import { ActivityContext } from '../activity-context'
import { AppFooter } from './app-footer'
import { SafeInsightsLogo } from './svg/si-logo'

type Props = {
    children: ReactNode
}

export function FocusedLayoutShell({ children }: Props) {
    const pathname = usePathname()
    const router = useRouter()
    const isSignInFlow = pathname.startsWith('/account/signin') || pathname.startsWith('/account/reset-password')

    return (
        <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
            <Notifications position="top-right" autoClose={NOTIFICATION_DISPLAY_MS} />
            <ActivityContext />

            <AppShellHeader bg="purple.8" withBorder={false}>
                <Group
                    h="100%"
                    p="md"
                    style={{ cursor: isSignInFlow ? 'pointer' : '' }}
                    onClick={() => isSignInFlow && router.push(`${Routes.accountSignin}?restart=true` as Route)}
                >
                    <SafeInsightsLogo width={250} height={54} />
                </Group>
            </AppShellHeader>

            <AppShellMain
                bg="purple.8"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                px="md"
            >
                {children}
            </AppShellMain>
            <AppFooter />
        </AppShell>
    )
}
