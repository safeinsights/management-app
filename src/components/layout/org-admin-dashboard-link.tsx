'use client'

import { useSession } from '@/hooks/session'
import { NavLink } from '@mantine/core'
import { GearIcon, GlobeIcon, SlidersIcon, UsersThreeIcon } from '@phosphor-icons/react/dist/ssr'
import { useParams, usePathname } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { RefWrapper } from './nav-ref-wrapper'
import styles from './navbar-items.module.css'
import { NavbarLink } from './navbar-link'

interface OrgAdminDashboardLinkProps {
    isVisible: boolean
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ isVisible }) => {
    const pathname = usePathname()
    const { session } = useSession()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const isAdminPage = pathname.startsWith('/admin/')
    const orgAdminBaseUrl = orgSlug ? `/admin/team/${orgSlug}` : '/admin'
    const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(isAdminPage)

    useEffect(() => {
        setIsAdminMenuOpen(isAdminPage)
    }, [isAdminPage])

    if (!isVisible) return null

    return (
        <RefWrapper>
            <NavLink
                label="Admin"
                leftSection={<GearIcon />}
                component="button"
                onClick={() => setIsAdminMenuOpen((prev) => !prev)}
                active={isAdminPage}
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
                    label="Manage Org"
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
