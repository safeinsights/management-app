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

export const NavbarItems: FC = () => {
    const { isLoaded, isReviewer, isResearcher, isAdmin, preferredOrgSlug } = useAuthInfo()

    const pathname = usePathname()

    // wait for Clerk to finish loading before showing nav links
    if (!isLoaded) return null

    const dashboardURL = () => {
        if (isReviewer && preferredOrgSlug) return `/reviewer/${preferredOrgSlug}/dashboard`
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return `/admin/safeinsights`
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

            <OrgAdminDashboardLink pathname={pathname} />
            <OrgSwitcher />
        </Stack>
    )
}
