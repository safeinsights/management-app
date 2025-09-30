'use client'

import { AppShell, AppShellFooter, AppShellHeader, AppShellMain, Group, Text, useMantineTheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { ActivityContext } from '../activity-context'
import { SafeInsightsLogo } from './si-logo'

type Props = {
    children: ReactNode
}

export function FocusedLayoutShell({ children }: Props) {
    const theme = useMantineTheme()
    const pathname = usePathname()
    const router = useRouter()
    const isSignInFlow = pathname.startsWith('/account/signin') || pathname.startsWith('/account/reset-password')

    return (
        <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
            <Notifications position="top-right" />
            <ActivityContext />

            <AppShellHeader bg="purple.8" withBorder={false}>
                <Group
                    h="100%"
                    p="md"
                    style={{ cursor: isSignInFlow ? 'pointer' : '' }}
                    onClick={() => isSignInFlow && router.push('/account/signin?restart=true')}
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
            <AppShellFooter p="md" bg={theme.colors.purple[9]} bd="none">
                <Group justify="left" c="white">
                    <Text c="white" fz="sm">
                        © 2025 - SafeInsights, Rice University
                    </Text>
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
