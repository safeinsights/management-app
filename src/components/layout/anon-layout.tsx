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
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/nextjs'

type Props = {
    children: ReactNode
    clerkPublishableKey: string
}

export function AnonLayout({ children, clerkPublishableKey }: Props) {
    const theme = useMantineTheme()

    return (
        <ClerkProvider publishableKey={clerkPublishableKey}>
            <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'xs' }} padding="md">
                <Notifications position="top-right" />
                <AppShellNavbar bg={theme.colors.purple[8]}>
                    <Stack py="md">
                        <AppShellSection>
                            <Link href="/">
                                <SafeInsightsLogo />
                            </Link>
                        </AppShellSection>
                    </Stack>
                </AppShellNavbar>
                <AppShellMain bg="#F1F3F5">{children}</AppShellMain>
                <AppShellFooter p="md" bg={theme.colors.purple[9]} bd="none">
                    <Group justify="left" c="white">
                        <Text c="white">© 2025 - SafeInsights, Rice University</Text>
                    </Group>
                </AppShellFooter>
            </AppShell>
        </ClerkProvider>
    )
}
