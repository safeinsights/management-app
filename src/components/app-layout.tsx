import { Group, AppShell, AppShellHeader, AppShellMain } from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import { NavAuthMenu } from './nav-auth-menu'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'

import '@mantine/notifications/styles.css'

type Props = {
    children: React.ReactNode
}

export function AppLayout({ children }: Props) {
    return (
        <AppShell header={{ height: 60 }} padding="md">
            <Notifications />
            <AppShellHeader>
                <Group h="100%" px="md" justify="space-between">
                    <Link href="/">
                        <SafeInsightsLogo height={30} />
                    </Link>
                    <NavAuthMenu />
                </Group>
            </AppShellHeader>

            <AppShellMain>{children}</AppShellMain>
        </AppShell>
    )
}
