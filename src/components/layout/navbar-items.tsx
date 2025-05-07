'use client'

import { FC, useState, useEffect } from 'react'
import { Group, NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Gear, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { OrganizationSwitcher, Protect } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'

export const NavbarItems: FC = () => {
    const { isReviewer, isResearcher, isAdmin, orgSlug } = useAuthInfo()
    const pathname = usePathname()
    const orgAdminBaseUrl = `/organization/${orgSlug}/admin`

    // State for controlling the Admin NavLink's opened/closed status
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false)

    useEffect(() => {
        if (orgSlug) {
            if (pathname.startsWith(orgAdminBaseUrl)) {
                setIsAdminMenuOpen(true)
            } else {
                // If navigating away from admin pages (but still in an org),
                // collapse the menu. The user can re-open it manually.
                setIsAdminMenuOpen(false)
            }
        } else {
            setIsAdminMenuOpen(false)
        }
    }, [pathname, orgAdminBaseUrl, orgSlug]) // Rerun when path or org context changes

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
                        onClick={() => setIsAdminMenuOpen((prev) => !prev)}
                        active={false}
                        opened={isAdminMenuOpen}
                        c="white"
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
                        {/* TODO: re-add if we have a settings org admin settings page */}
                        {/* <NavLink
                            label="Settings"
                            leftSection={<Sliders size={20} />}
                            component={Link}
                            href={`${orgAdminBaseUrl}/settings`}
                            active={pathname === `${orgAdminBaseUrl}/settings`}
                            c="white"
                            color="blue.7"
                            variant="filled"
                            className={styles.navLinkHover}
                            pl="xl"
                        /> */}
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
