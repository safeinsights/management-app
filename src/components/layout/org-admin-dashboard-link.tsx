'use client'

import { FC, useEffect, useState } from 'react'
import { NavLink } from '@mantine/core'
import Link from 'next/link'
import { GearIcon, UsersThreeIcon, SlidersIcon, GlobeIcon } from '@phosphor-icons/react/dist/ssr'
import styles from './navbar-items.module.css'
import { useSession } from '@/hooks/session'
import { usePathname } from 'next/navigation'
import { NavbarLink } from './navbar-link'
import { RefWrapper } from './nav-ref-wrapper'

interface OrgAdminDashboardLinkProps {
    isVisible: boolean
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ isVisible }) => {
    const pathname = usePathname()
    const { session } = useSession()

    const orgAdminBaseUrl = `/admin/team/${session?.team.slug}`
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(pathname.startsWith('/admin/'))

    useEffect(() => {
        setIsAdminMenuOpen(pathname.startsWith('/admin/'))
    }, [pathname])

    if (!isVisible) return null

    return (
        <RefWrapper>
            <NavLink
                label="Admin"
                leftSection={<GearIcon />}
                component="button"
                onClick={() => setIsAdminMenuOpen((prev) => !prev)}
                active={pathname.startsWith('/admin/')}
                opened={isAdminMenuOpen}
                c="white"
                className={styles.navLinkHover}
                rightSection={null}
                aria-haspopup="true"
            >
                <NavbarLink
                    isVisible={session?.user.isSiAdmin || false}
                    url={`/admin/safeinsights`}
                    label="SI Admin Dashboard"
                    icon={<GlobeIcon />}
                    pl="xl"
                />
                <NavbarLink
                    isVisible={true}
                    label="Manage Team"
                    icon={<UsersThreeIcon size={20} />}
                    url={`${orgAdminBaseUrl}`}
                    pl="xl"
                />
                <NavbarLink
                    isVisible={true}
                    label="Settings"
                    icon={<SlidersIcon size={20} />}
                    url={`${orgAdminBaseUrl}/settings`}
                    pl="xl"
                />
            </NavLink>
        </RefWrapper>
    )
}
