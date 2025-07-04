'use client'

import { FC, useState, useEffect } from 'react'
import { NavLink } from '@mantine/core'
import Link from 'next/link'
import { GearIcon, UsersThreeIcon, SlidersIcon } from '@phosphor-icons/react/dist/ssr'
import styles from './navbar-items.module.css'
import { Protect } from '../auth'
import { useOrgInfo } from '../org-info'
import { AuthRole } from '@/lib/types'

interface OrgAdminDashboardLinkProps {
    pathname: string
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ pathname }) => {
    const { orgSlug } = useOrgInfo()

    const orgAdminBaseUrl = `/admin/team/${orgSlug}`
    // avoid a "closed->open" flash on selecting submenus first time by seeding state from the current path
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(() => Boolean(pathname.startsWith(orgAdminBaseUrl)))

    useEffect(() => {
        if (orgSlug) {
            if (pathname.startsWith(orgAdminBaseUrl)) {
                setIsAdminMenuOpen(true)
            } else {
                setIsAdminMenuOpen(false)
            }
        } else {
            setIsAdminMenuOpen(false)
        }
    }, [pathname, orgAdminBaseUrl, orgSlug])

    if (!orgSlug) {
        return null
    }

    return (
        <Protect role={AuthRole.Admin}>
            <NavLink
                label="Admin"
                leftSection={<GearIcon />}
                onClick={() => {
                    if (!pathname.startsWith(orgAdminBaseUrl)) {
                        setIsAdminMenuOpen((prev) => !prev)
                    }
                }}
                active={false}
                opened={isAdminMenuOpen}
                c="white"
                className={styles.navLinkHover}
                rightSection={null}
            >
                <NavLink
                    label="Manage Team"
                    leftSection={<UsersThreeIcon size={20} />}
                    component={Link}
                    href={`${orgAdminBaseUrl}`}
                    active={pathname === `${orgAdminBaseUrl}`}
                    c="white"
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkHover}
                    pl="xl"
                />
                <NavLink
                    label="Settings"
                    leftSection={<SlidersIcon size={20} />}
                    component={Link}
                    href={`${orgAdminBaseUrl}/settings`}
                    active={pathname === `${orgAdminBaseUrl}/settings`}
                    c="white"
                    color="blue.7"
                    variant="filled"
                    className={styles.navLinkHover}
                    pl="xl"
                />
            </NavLink>
        </Protect>
    )
}
