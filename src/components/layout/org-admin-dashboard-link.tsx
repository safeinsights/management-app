'use client'

import { FC, useEffect, useState } from 'react'
import { NavLink } from '@mantine/core'
import Link from 'next/link'
import { GearIcon, UsersThreeIcon, SlidersIcon, GlobeIcon } from '@phosphor-icons/react/dist/ssr'
import styles from './navbar-items.module.css'
import { useSession } from '@/hooks/session'
import { RefWrapper } from './nav-ref-wrapper'
import { usePathname } from 'next/navigation'
import { NavbarLink } from './navbar-link'

interface OrgAdminDashboardLinkProps {
    isVisible: boolean
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ isVisible }) => {
    const pathname = usePathname()
    const { session } = useSession()

    const orgAdminBaseUrl = `/admin/team/${session?.team.slug}`
    const isAdminURL = Boolean(pathname.startsWith(orgAdminBaseUrl))

    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(isAdminURL)

    useEffect(() => {
        if (isAdminURL && !isAdminMenuOpen) {
            setIsAdminMenuOpen(true)
        }
    }, [isAdminURL, isAdminMenuOpen])

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
                opened={isAdminURL || isAdminMenuOpen}
                c="white"
                className={styles.navLinkHover}
                rightSection={null}
            >
                <NavbarLink
                    isVisible={session?.user.isSiAdmin || false}
                    url={`/admin/safeinsights`}
                    label="SI Admin Dashboard"
                    icon={<GlobeIcon />}
                    pl="xl"
                />
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
