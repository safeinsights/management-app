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
import { OrganizationSwitcher, useAuth } from '@clerk/nextjs'
import { ReactNode } from 'react'
import { NavbarItems } from '@/components/layout/navbar-items'
import { usePathname } from 'next/navigation'

type Props = {
    children: ReactNode
}

export function AppLayout({ children }: Props) {
    const { isSignedIn } = useAuth()
    const pathname = usePathname()
    const theme = useMantineTheme()

    // If user isn't signed in, don't render the whole layout
    if (!isSignedIn) {
        return <div>{children}</div>
    }

    // Don't show the sidebar for the keys page
    if (pathname === '/account/keys') {
        return <div>{children}</div>
    }

    return (
        <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'xs' }} padding="md">
            <Notifications />

            <AppShellNavbar bg={theme.colors.purple[8]}>
                <Stack py="md">
                    <AppShellSection>
                        <Link href="/">
                            <SafeInsightsLogo />
                        </Link>
                    </AppShellSection>
                    <AppShellSection grow>
                        <NavbarItems />
                    </AppShellSection>
                </Stack>
            </AppShellNavbar>
            <AppShellMain bg="#F1F3F5">{children}</AppShellMain>
            <AppShellFooter p="md" bg={theme.colors.purple[9]}>
                <Group justify="center" c="white">
                    <Text>© 2025 - SafeInsights</Text>
                    {/* TODO Temporary for dev mode only? admins? */}
                    <OrganizationSwitcher afterSelectOrganizationUrl="/" />
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
