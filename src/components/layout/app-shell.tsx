'use client'

import {
    AppShell as MantineAppShell,
    AppShellFooter,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Stack,
    Text,
} from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { ReactNode } from 'react'
import { NavbarItems } from '@/components/layout/navbar-items'
import { RequireMFA } from '../require-mfa'
import { RequireUser } from '../require-user'
import { NavbarProfileMenu } from './navbar-profile-menu'

type Props = {
    children: ReactNode
}
export function AppShell({ children }: Props) {
    return (
        <MantineAppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'xs' }} padding="md">
            <RequireUser />
            <RequireMFA />

            <Notifications position="top-right" />
            <AppShellNavbar bg="purple.8">
                <Stack py="md">
                    <AppShellSection>
                        <Link href="/">
                            <SafeInsightsLogo />
                        </Link>
                    </AppShellSection>
                </Stack>
                <AppShellSection grow>
                    <NavbarItems />
                </AppShellSection>
                <NavbarProfileMenu />
            </AppShellNavbar>
            <AppShellMain bg="#F1F3F5">{children}</AppShellMain>
            <AppShellFooter p="md" bg="purple.9" bd="none">
                <Text ta="left" c="#FFFFFF">
                    © 2025 - SafeInsights, Rice University
                </Text>
            </AppShellFooter>
        </MantineAppShell>
    )
}
