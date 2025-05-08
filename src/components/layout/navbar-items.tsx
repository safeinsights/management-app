'use client'

import { FC } from 'react'
import { Group, NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House } from '@phosphor-icons/react/dist/ssr'
import { OrganizationSwitcher } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'
import { useHasMultipleRoles } from '../org-info'

export const NavbarItems: FC = () => {
    const { isReviewer, isResearcher, isAdmin } = useAuthInfo()
    const pathname = usePathname()
    const isMulitple = useHasMultipleRoles()

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
            {isMulitple && (
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
            )}
        </Stack>
    )
}
