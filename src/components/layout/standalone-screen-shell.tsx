'use client'

import type { ReactNode } from 'react'
import { AppShell, AppShellHeader, AppShellMain, Center, Group } from '@mantine/core'
import { AppFooter } from '@/components/layout/app-footer'
import { SafeInsightsLogo } from '@/components/layout/svg/si-logo'
import { MAIN_CONTENT_PROPS, SIDENAV_BG } from '@/lib/constants'

// The 404 and error screens render outside every app shell, so they carry their own main as the
// route-focus target.
export function StandaloneScreenShell({ children }: { children: ReactNode }) {
    return (
        <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
            <AppShellHeader bg={SIDENAV_BG} withBorder={false}>
                <Group h="100%" p="md">
                    <SafeInsightsLogo width={250} height={54} />
                </Group>
            </AppShellHeader>

            <AppShellMain {...MAIN_CONTENT_PROPS} bg={SIDENAV_BG} display="flex" px="md">
                <Center flex={1}>{children}</Center>
            </AppShellMain>
            <AppFooter isDark />
        </AppShell>
    )
}
