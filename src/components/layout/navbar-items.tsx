'use client'

import { FC } from 'react'
import { Group, NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House } from '@phosphor-icons/react/dist/ssr'
import { OrganizationSwitcher } from '@clerk/nextjs'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'

export const NavbarItems: FC = () => {
    const { isLoaded, isReviewer, isResearcher, isAdmin, orgSlug } = useAuthInfo()

    const pathname = usePathname()

    // wait for Clerk to finish loading before showing nav links
    if (!isLoaded) return null

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

            <OrgAdminDashboardLink orgSlug={orgSlug} pathname={pathname} />

            <Group justify="left" c="white" w="100%">
                <OrganizationSwitcher
                    afterSelectOrganizationUrl="/"
                    appearance={{
                        elements: {
                            rootBox: {
                                width: '100%',
                            },
                            organizationSwitcherTrigger: {
                                color: 'white !important',
                                '& span': { color: 'white !important' },
                                padding: `12px 10px`,
                                width: '100%',
                                borderRadius: '0',
                                '&:hover': {
                                    backgroundColor: 'var(--mantine-color-blue-9)',
                                },
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            },
                            organizationPreview: {
                                gap: 'var(--mantine-spacing-sm)',
                            },
                        },
                    }}
                />
            </Group>
        </Stack>
    )
}
