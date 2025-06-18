'use client'

import { AppShell, AppShellFooter, AppShellHeader, AppShellMain, Group, Text, useMantineTheme } from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { ReactNode } from 'react'

type Props = {
    children: ReactNode
}

export function AnonLayoutShell({ children }: Props) {
    const theme = useMantineTheme()

    return (
        <AppShell header={{ height: 70 }} footer={{ height: 60 }}>
            <Notifications position="top-right" />

            <AppShellHeader bg="purple.8" withBorder={false}>
                <Group h="100%" p="md">
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
                    <Text c="white">© 2025 - SafeInsights, Rice University</Text>
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
