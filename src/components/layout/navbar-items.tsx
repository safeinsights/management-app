'use client'

import { FC } from 'react'
import { Divider, Stack, Group, NavLink } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { useClerk, OrganizationSwitcher } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'

export const NavbarItems: FC = () => {
    const { signOut, openUserProfile } = useClerk()
    const { isMember, isResearcher, isAdmin } = useAuthInfo()
    const pathname = usePathname()

    const dashboardURL = () => {
        if (isMember) return '/member/openstax/dashboard'
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return '/admin/dashboard'
        return '/'
    }

    const currentDashboardUrl = dashboardURL()

    // Define common hover style using CSS variable
    return (
        <Stack gap="xs">
            <NavLink
                label="Dashboard"
                leftSection={<House />}
                component={Link}
                href={currentDashboardUrl}
                active={pathname === currentDashboardUrl}
                c="white"
                color="blue.7"
                variant="filled"
                className={styles.navLinkHover}
            />

            <NavLink
                label="Settings"
                leftSection={<Gear />}
                onClick={() => openUserProfile()}
                c="white"
                className={styles.navLinkHover}
            />

            <Divider color="#D4D1F3" />
            <Group justify="left" pl="xs" c="white">
                <OrganizationSwitcher
                    afterSelectOrganizationUrl="/"
                    appearance={{
                        elements: {
                            organizationSwitcherTrigger: {
                                color: 'white !important',
                                '& span': { color: 'white !important' },
                                padding: 0,
                            },
                        },
                    }}
                />
            </Group>
            <NavLink
                label="Logout"
                leftSection={<SignOut />}
                onClick={() => signOut()}
                c="white"
                className={styles.navLinkHover}
            />
        </Stack>
    )
}
