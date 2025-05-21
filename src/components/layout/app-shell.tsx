'use client'

import {
    AppShell as MantineAppShell,
    AppShellFooter,
    AppShellHeader,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Burger,
    Group,
    Stack,
    Text,
    useMantineTheme,
} from '@mantine/core'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { ReactNode } from 'react'
import { NavbarItems } from '@/components/layout/navbar-items'
import { RequireMFA } from '../require-mfa'
import { RequireUser } from '../require-user'
import { NavbarProfileMenu } from './navbar-profile-menu'
import { ActivityContext } from '../activity-context'

type Props = { children: ReactNode }

export function AppShell({ children }: Props) {
    const theme = useMantineTheme()
    const isDesktop = useMediaQuery(
        `(min-width: ${theme.breakpoints.sm})`,
        true, // initialValue to prevent hydration error
        { getInitialValueInEffect: true },
    )
    const [opened, { toggle }] = useDisclosure(false)

    return (
        <MantineAppShell
            header={{ height: 60, collapsed: isDesktop }}
            footer={{ height: 60 }}
            navbar={{
                width: 250,
                breakpoint: 'sm',
                collapsed: { mobile: !opened, desktop: false },
            }}
            padding="md"
        >
            <RequireUser />
            <RequireMFA />
            <Notifications position="top-right" />
            <ActivityContext />

            <AppShellHeader bg="purple.8" w="100%">
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="white" />
                    <Link href="/">
                        <SafeInsightsLogo />
                    </Link>
                </Group>
            </AppShellHeader>

            <AppShellNavbar bg="purple.8">
                <Stack py="md">
                    {isDesktop && (
                        <AppShellSection>
                            <Link href="/">
                                <SafeInsightsLogo />
                            </Link>
                        </AppShellSection>
                    )}
                </Stack>
                <AppShellSection grow>
                    <NavbarItems />
                </AppShellSection>
                <NavbarProfileMenu />
            </AppShellNavbar>

            <AppShellMain bg="grey.10">{children}</AppShellMain>

            <AppShellFooter p="md" bg="purple.9" bd="none">
                <Text ta="left" c="white">
                    © 2025 - SafeInsights, Rice University
                </Text>
            </AppShellFooter>
        </MantineAppShell>
    )
}
