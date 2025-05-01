'use client'

import { FC } from 'react'
import { Group, NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Gear, House, SignOut } from '@phosphor-icons/react/dist/ssr'
import { OrganizationSwitcher, useClerk } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'

export const NavbarItems: FC = () => {
    const { signOut, openUserProfile } = useClerk()
    const { isReviewer, isResearcher, isAdmin } = useAuthInfo()
    const pathname = usePathname()

    const dashboardURL = () => {
        if (isReviewer) return '/reviewer/openstax/dashboard'
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return '/admin/dashboard'
        return '/'
    }

    return (
        <Stack gap="sm">
            <NavLink
                label="Dashboard"
                leftSection={<House />}
                component={Link}
                href={dashboardURL()}
                active={pathname === dashboardURL()}
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
            <Group justify="left" pl="xs" c="white">
                <OrganizationSwitcher
                    afterSelectOrganizationUrl="/"
                    appearance={{
                        elements: {
                            organizationSwitcherTrigger: {
                                color: 'white !important',
                                '& span': { color: 'white !important' },
                                padding: 0,
                                '&:hover': {
                                    backgroundColor: 'var(--mantine-color-blue-9)',
                                },
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
