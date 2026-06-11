'use client'

import {
    AppShellHeader,
    AppShellMain,
    Burger,
    Group,
    AppShell as MantineAppShell,
    useMantineTheme,
} from '@mantine/core'

import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import { Notifications } from '@mantine/notifications'
import { NOTIFICATION_DISPLAY_MS } from '@/lib/constants'
import '@mantine/notifications/styles.css'
import Link from 'next/link'
import { ReactNode } from 'react'
import { AppFooter } from './app-footer'
import { SafeInsightsLogo } from './svg/si-logo'

import { RequireMFA } from '../require-mfa'
import { RequireUser } from '../require-user'

import { ActivityContext } from '../activity-context'
import { RequireUserKey } from '../require-user-key'
import { AppNav } from './app-nav'
import { Routes } from '@/lib/routes'

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
            bg="grey.10"
            header={{ height: 60, collapsed: isDesktop }}
            footer={{ height: 60 }}
            navbar={{
                width: 260,
                breakpoint: 'sm',
                collapsed: { mobile: !opened, desktop: false },
            }}
            padding="md"
        >
            <RequireUser />
            <RequireMFA />
            <RequireUserKey />
            <Notifications position="top-right" autoClose={NOTIFICATION_DISPLAY_MS} />
            <ActivityContext />

            <AppShellHeader bg="purple.8" w="100%">
                <Group h="100%" px="md">
                    <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" color="white" />
                    <Link href={Routes.home}>
                        <SafeInsightsLogo />
                    </Link>
                </Group>
            </AppShellHeader>

            <AppNav isDesktop={isDesktop} />

            <AppShellMain bg="grey.10" style={{ maxWidth: 1600, width: '100%', margin: '0 auto' }}>
                {children}
            </AppShellMain>

            <AppFooter />
        </MantineAppShell>
    )
}
