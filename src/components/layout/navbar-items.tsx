'use client'

import { FC } from 'react'
import { NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HouseIcon } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/hooks/session'
import styles from './navbar-items.module.css'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { OrgSwitcher } from '../org/org-switcher'
import { RefWrapper } from './nav-ref-wrapper'

export const NavbarItems: FC = () => {
    const { isLoaded, session } = useSession()
    const pathname = usePathname()

    if (!isLoaded) return null

    let dashboardURL = '/'

    if (session.team.isResearcher) {
        dashboardURL = '/researcher/dashboard'
    } else if (session.team.isReviewer) {
        return `/reviewer/${session.team.slug}/dashboard`
    } else if (session.team.isAdmin) {
        dashboardURL = `/admin/team/${session.team.slug}`
    }

    return (
        <Stack gap="sm">
            <RefWrapper>
                <NavLink
                    label="Dashboard"
                    leftSection={<HouseIcon />}
                    component={Link}
                    href={dashboardURL}
                    active={pathname === dashboardURL}
                    c="white"
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkHover}
                    aria-label="Dashboard"
                />
            </RefWrapper>

            {session.team.isAdmin && (
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
