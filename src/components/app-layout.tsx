import {
    AppShell,
    AppShellFooter,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Group,
    NavLink,
    ScrollArea,
} from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { IconHome, IconSettings } from '@tabler/icons-react'
import { OrganizationSwitcher, SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs'

type Props = {
    children: React.ReactNode
}

export function AppLayout({ children }: Props) {
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
                    <NavLink
                        href="/member/openstax/dashboard"
                        c="white"
                        label="Dashboard"
                        leftSection={<IconHome size={16} stroke={1.5} />}
                    />
                </AppShellSection>
                <AppShellSection>
                    {/* TODO Flesh out styles for this stuff with UX */}
                    <SignedOut>
                        <SignInButton />
                    </SignedOut>

                    <SignedIn>
                        <Group>
                            <OrganizationSwitcher />
                            <UserButton />
                        </Group>
                    </SignedIn>
                    {/* TODO open the user settings in a modal? page? flesh out */}
                    <NavLink
                        component="button"
                        // onClick={}
                        // href="/settings"
                        c="white"
                        label="Settings"
                        leftSection={<IconSettings size={16} stroke={1.5} />}
                    />
                </AppShellSection>
            </AppShellNavbar>
            <AppShellMain>{children}</AppShellMain>
            <AppShellFooter p="md" bg="gray">
                Footer
            </AppShellFooter>
        </AppShell>
    )
}
