'use client'

import { FC, useRef } from 'react'
import { NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { House } from '@phosphor-icons/react/dist/ssr'
import { useAuthInfo } from '@/components/auth'
import styles from './navbar-items.module.css'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { OrgSwitcher } from '../org/org-switcher'
import { RefWrapper, useKeyboardNav } from './nabar-hotkeys-hook'

export const NavbarItems: FC = () => {
    const { isLoaded, isReviewer, isResearcher, isAdmin, preferredOrgSlug } = useAuthInfo()

    const pathname = usePathname()

    const dashboardLinkRef = useRef<HTMLDivElement>(null)
    const orgAdminDashboardLinkRef = useRef<HTMLDivElement>(null)
    const orgSwitcherRef = useRef<HTMLDivElement>(null)

    const dashboardURL = () => {
        if (isReviewer && preferredOrgSlug) return `/reviewer/${preferredOrgSlug}/dashboard`
        if (isResearcher) return '/researcher/dashboard'
        if (isAdmin) return `/admin/safeinsights`
        return '/'
    }

    const navElements = [dashboardLinkRef]

    if (isAdmin) {
        navElements.push(orgAdminDashboardLinkRef)
    }

    navElements.push(orgSwitcherRef)

    useKeyboardNav({
        elements: navElements,
    })

    if (!isLoaded) return null

    return (
        <Stack gap="sm">
            <RefWrapper ref={dashboardLinkRef} role="menuitem" tabIndex={0}>
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
                <RefWrapper
                    ref={orgAdminDashboardLinkRef}
                    role="menuitem"
                    tabIndex={1}
                    aria-label="Org Admin Dashboard"
                >
                    <OrgAdminDashboardLink pathname={pathname} />
                </RefWrapper>
            )}
            <RefWrapper ref={orgSwitcherRef} role="menuitem" tabIndex={2} aria-label="Org Switcher">
                <OrgSwitcher />
            </RefWrapper>
        </Stack>
    )
}
