'use client'

import { NavLink } from '@mantine/core'
import { GearIcon, SlidersIcon, UsersThreeIcon } from '@phosphor-icons/react/dist/ssr'
import { useParams, usePathname } from 'next/navigation'
import { FC, useEffect, useState } from 'react'
import { RefWrapper } from './nav-ref-wrapper'
import styles from './navbar-items.module.css'
import { NavbarLink } from './navbar-link'
import { Routes } from '@/lib/routes'
import { ActionSuccessType } from '@/lib/types'
import { fetchUsersOrgsWithStatsAction } from '@/server/actions/org.actions'
type Org = ActionSuccessType<typeof fetchUsersOrgsWithStatsAction>[number]

interface OrgAdminDashboardLinkProps {
    isVisible: boolean
    org: Org
}

export const OrgAdminDashboardLink: FC<OrgAdminDashboardLinkProps> = ({ isVisible, org }) => {
    const pathname = usePathname()
    const { orgSlug } = useParams<{ orgSlug: string }>()

    const isAdminPage = pathname.startsWith('/admin/')

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
                    isVisible
                    label="Team"
                    icon={<UsersThreeIcon size={20} />}
                    url={Routes.adminTeam({ orgSlug })}
                    pl="xl"
                />
                <NavbarLink
                    isVisible={org.type !== 'lab'}
                    label="Settings"
                    icon={<SlidersIcon size={20} />}
                    url={Routes.adminSettings({ orgSlug })}
                    pl="xl"
                />
            </NavLink>
        </RefWrapper>
    )
}
