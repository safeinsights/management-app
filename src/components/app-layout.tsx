'use client'

import {
    AppShell,
    AppShellFooter,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Divider,
    Group,
    NavLink,
    ScrollArea,
    Text,
} from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { OrganizationSwitcher, SignedIn, SignedOut, SignInButton, useClerk, UserButton } from '@clerk/nextjs'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { ReactNode } from 'react'

type Props = {
    children: ReactNode
}

export function AppLayout({ children }: Props) {
    const { signOut } = useClerk()
    return (
        <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'sm' }} padding="md">
            <Notifications />

            <AppShellNavbar p="md" bg="dark">
                <AppShellSection>
                    <Link href="/">
                        <SafeInsightsLogo height={30} />
                    </Link>
                </AppShellSection>
                <AppShellSection grow my="md" component={ScrollArea}>
                    <NavLink href="/member/openstax/dashboard" c="white" label="Dashboard" leftSection={<House />} />
                    {/* TODO open the user settings in a modal? page? flesh out */}
                    <NavLink
                        component="button"
                        // onClick={}
                        // href="/settings"
                        c="white"
                        label="Settings"
                        leftSection={<Gear />}
                    />
                    <Divider />
                    <NavLink
                        component="button"
                        onClick={() => signOut()}
                        c="white"
                        label="Logout"
                        leftSection={<SignOut />}
                    />
                </AppShellSection>
                {/* TODO Flesh out styles for this clerk provided component stuff with UX */}
                <AppShellSection>
                    <SignedOut>
                        <SignInButton />
                    </SignedOut>

                    <SignedIn>
                        <Group>
                            <OrganizationSwitcher />
                            <UserButton data-testid="clerk-user-account" />
                        </Group>
                    </SignedIn>
                </AppShellSection>
            </AppShellNavbar>
            <AppShellMain>{children}</AppShellMain>
            <AppShellFooter p="md" bg="gray">
                <Group justify="center">
                    <Text>© 2025 - SafeInsights</Text>
                </Group>
            </AppShellFooter>
        </AppShell>
    )
}
