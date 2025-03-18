'use client'

import { AppShell, AppShellFooter, AppShellMain, AppShellNavbar, AppShellSection, Group, Text } from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { OrganizationSwitcher, useAuth } from '@clerk/nextjs'
import { ReactNode } from 'react'
import { NavbarItems } from '@/components/layout/navbar-items'

type Props = {
    children: ReactNode
}

export function AppLayout({ children }: Props) {
    const { isSignedIn } = useAuth()

    // If user isn't signed in, don't render the whole layout
    if (!isSignedIn) {
        return <div>{children}</div>
    }

    return (
        <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'sm' }} padding="md">
            <Notifications />

            <AppShellNavbar p="md" bg="#080527">
                <AppShellSection>
                    <Link href="/">
                        <SafeInsightsLogo />
                    </Link>
                </AppShellSection>
                <AppShellSection grow my="md">
                    <NavbarItems />
                </AppShellSection>
            </AppShellNavbar>
            <AppShellMain bg="#F1F3F5">{children}</AppShellMain>
            <AppShellFooter p="md" bg="#353068">
                <Group justify="center" c="white">
                    <Text>© 2025 - SafeInsights</Text>
                    {/* TODO Temporary for dev mode only? admins? */}
                    <OrganizationSwitcher afterSelectOrganizationUrl="/" />
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
