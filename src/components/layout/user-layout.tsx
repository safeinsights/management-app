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
import { OrganizationSwitcher, useUser } from '@clerk/nextjs'
import { ReactNode } from 'react'
import { NavbarItems } from '@/components/layout/navbar-items'
import { ClerkProvider } from '@clerk/nextjs'
import { RequireMFA } from '../require-mfa'

type Props = {
    children: ReactNode
}

export function UserLayout({ children }: Props) {
    const theme = useMantineTheme()
    const { isSignedIn } = useUser()
    if (!isSignedIn) return null

    return (
        <ClerkProvider>
            <AppShell footer={{ height: 60 }} navbar={{ width: 250, breakpoint: 'xs' }} padding="md">
                <Notifications position="top-right" />
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
            <RequireMFA />
        </ClerkProvider>
    )
}
