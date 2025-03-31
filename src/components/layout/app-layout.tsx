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

            {/* TODO use siPurple.5 or whatever shade we want, blocked by UX */}
            <AppShellNavbar bg="#100A4C">
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
            <AppShellFooter p="md" bg="#353068">
                <Group justify="center" c="white">
                    <Text>© 2025 - SafeInsights</Text>e{/* TODO Temporary for dev mode only? admins? */}
                    <OrganizationSwitcher afterSelectOrganizationUrl="/" />
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
