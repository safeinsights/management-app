'use client'

import {
    AppShell,
    AppShellFooter,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Group,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core'
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
        <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'xs' }} padding="md">
            <Notifications position="top-right" />
            <AppShellNavbar bg={theme.colors.purple[8]} withBorder={false}>
                <Stack py="md">
                    <AppShellSection>
                        <SafeInsightsLogo />
                    </AppShellSection>
                </Stack>
            </AppShellNavbar>
            <AppShellMain style={{ display: 'flex', alignItems: 'center', marginLeft: -250 }} bg="purple.8">
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
