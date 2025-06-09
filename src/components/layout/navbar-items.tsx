'use client'

import { FC } from 'react'
import { NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House } from '@phosphor-icons/react/dist/ssr'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { OrgSwitcher } from '../org/org-switcher'
import { RefWrapper } from './nav-ref-wrapper'

export const NavbarItems: FC = () => {
    const { isLoaded, isReviewer, isResearcher, isAdmin, preferredOrgSlug } = useAuthInfo()
    const pathname = usePathname()

    const dashboardURL = () => {
        if (isReviewer && preferredOrgSlug) return `/reviewer/${preferredOrgSlug}/dashboard`
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return `/admin/safeinsights`
        return '/'
    }

    if (!isLoaded) return null

    return (
        <Stack gap="sm">
            <RefWrapper>
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
                    aria-label="Dashboard"
                />
            </RefWrapper>

            {isAdmin && (
                <RefWrapper>
                    <OrgAdminDashboardLink pathname={pathname} />
                </RefWrapper>
            )}

            <RefWrapper>
                <OrgSwitcher />
            </RefWrapper>
        </Stack>
    )
}
