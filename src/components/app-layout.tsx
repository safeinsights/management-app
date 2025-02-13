import {
    AppShell,
    AppShellFooter,
    AppShellMain,
    AppShellNavbar,
    AppShellSection,
    Group,
    NavLink,
    ScrollArea,
    Text,
} from '@mantine/core'
import { SafeInsightsLogo } from './si-logo'
import Link from 'next/link'
import { Notifications } from '@mantine/notifications'
import '@mantine/notifications/styles.css'
import { IconHome } from '@tabler/icons-react'
import { OrganizationSwitcher, SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/nextjs'
import { Gear } from '@phosphor-icons/react/dist/ssr'
import { ReactNode } from 'react'

type Props = {
    children: ReactNode
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
                        leftSection={<Gear size={16} />}
                    />
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
