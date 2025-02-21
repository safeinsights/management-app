'use client'

import {
    AppShell,
    AppShellFooter,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Button,
    Divider,
    Group,
    Text,
} from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { OrganizationSwitcher, useAuth, useClerk } from '@clerk/nextjs'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { ReactNode } from 'react'

type Props = {
    children: ReactNode
}

export function AppLayout({ children }: Props) {
    const { signOut, openUserProfile } = useClerk()
    const { isSignedIn } = useAuth()

    if (!isSignedIn) {
        return <div>{children}</div>
    }

    return (
        <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'sm' }} padding="md">
            <Notifications />

            <AppShellNavbar p="md" bg="dark">
                <AppShellSection>
                    <Link href="/">
                        {/* TODO Update logo eventually with correct image for better contrast against dark background */}
                        <SafeInsightsLogo />
                    </Link>
                </AppShellSection>
                <AppShellSection grow my="md">
                    <Button
                        variant="transparent"
                        component={Link}
                        href="/member/openstax/dashboard"
                        c="white"
                        leftSection={<House />}
                    >
                        Dashboard
                    </Button>

                    <Button variant="transparent" onClick={() => openUserProfile()} c="white" leftSection={<Gear />}>
                        Settings
                    </Button>

                    <Divider />

                    <Button variant="transparent" onClick={() => signOut()} c="white" leftSection={<SignOut />}>
                        Logout
                    </Button>
                </AppShellSection>
            </AppShellNavbar>
            <AppShellMain>{children}</AppShellMain>
            <AppShellFooter p="md" bg="gray">
                <Group justify="center">
                    <Text>© 2025 - SafeInsights</Text>
                    <OrganizationSwitcher />
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
