'use client'

import { FC } from 'react'
import { Group, NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House, Gear } from '@phosphor-icons/react/dist/ssr'
import { OrganizationSwitcher } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'

export const NavbarItems: FC = () => {
    const { isLoaded, isReviewer, isResearcher, isAdmin, isOrgAdmin, orgSlug } = useAuthInfo()
    const pathname = usePathname()

    const dashboardURL = () => {
        if (isReviewer) {
            if (orgSlug) return `/reviewer/${orgSlug}/dashboard`
            // TODO: isReviewer without orgSlug should not happen. Maybe create some sort of error here?
        }
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return '/admin/dashboard'
        return '/'
    }

    const orgAdminPageURL = orgSlug ? `/organization/${orgSlug}/admin/users` : '#'

    if (!isLoaded) {
        return null
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

            {isOrgAdmin && orgSlug && !isAdmin && (
                <NavLink
                    label="Admin"
                    leftSection={<Gear />}
                    component={Link}
                    href={orgAdminPageURL}
                    active={pathname.startsWith(`/organization/${orgSlug}/admin`)}
                    c="white"
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkHover}
                />
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
