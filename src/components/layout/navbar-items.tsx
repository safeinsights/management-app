'use client'

import { FC } from 'react'
import { Group, NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Gear, UsersThree, Sliders } from '@phosphor-icons/react/dist/ssr'
import { OrganizationSwitcher, Protect } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'

export const NavbarItems: FC = () => {
    const { isReviewer, isResearcher, isAdmin, orgSlug } = useAuthInfo()
    const pathname = usePathname()
    const orgAdminBaseUrl = `/organization/${orgSlug}/admin`

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

            {orgSlug && (
                <Protect role="org:admin">
                    <NavLink
                        label="Admin"
                        leftSection={<Gear />}
                        active={pathname.startsWith(orgAdminBaseUrl)}
                        defaultOpened={pathname.startsWith(orgAdminBaseUrl)}
                        c="white"
                        color="blue.7"
                        variant="filled"
                        className={styles.navLinkHover}
                    >
                        <NavLink
                            label="Manage Team"
                            leftSection={<UsersThree size={20} />}
                            component={Link}
                            href={`${orgAdminBaseUrl}/users`}
                            active={pathname === `${orgAdminBaseUrl}/users`}
                            c="white"
                            color="blue.7"
                            variant="filled"
                            className={styles.navLinkHover}
                            pl="xl"
                        />
                        <NavLink
                            label="Settings"
                            leftSection={<Sliders size={20} />}
                            component={Link}
                            href={`${orgAdminBaseUrl}/settings`} // TODO: Placeholder link for settings
                            active={pathname === `${orgAdminBaseUrl}/settings`}
                            c="white"
                            color="blue.7"
                            variant="filled"
                            className={styles.navLinkHover}
                            pl="xl"
                        />
                    </NavLink>
                </Protect>
            )}

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
        </Stack>
    )
}
