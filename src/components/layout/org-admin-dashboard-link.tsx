'use client'

import { FC, useState } from 'react'
import { NavLink } from '@mantine/core'
import Link from 'next/link'
import { GearIcon, UsersThreeIcon, SlidersIcon } from '@phosphor-icons/react/dist/ssr'
import styles from './navbar-items.module.css'
import { useSession } from '@/hooks/session'
import { RefWrapper } from './nav-ref-wrapper'
import { usePathname } from 'next/navigation'

interface OrgAdminDashboardLinkProps {
    isVisible: boolean
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ isVisible }) => {
    const pathname = usePathname()
    const { session } = useSession()

    const orgAdminBaseUrl = `/admin/team/${session?.team.slug}`
    // avoid a "closed->open" flash on selecting submenus first time by seeding state from the current path
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(() => Boolean(pathname.startsWith(orgAdminBaseUrl)))

    if (!isVisible) return null

    return (
        <RefWrapper>
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
        </RefWrapper>
    )
}
