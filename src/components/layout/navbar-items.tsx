'use client'

import { FC } from 'react'
import { NavLink, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { StudentIcon, UserListIcon } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/hooks/session'
import styles from './navbar-items.module.css'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { OrgSwitcher } from '../org/org-switcher'
import { RefWrapper } from './nav-ref-wrapper'

const DashboardLink: FC<{ isVisible: boolean; url: string; label: string; icon: React.ReactNode }> = ({
    isVisible,
    url,
    label,
    icon,
}) => {
    const pathname = usePathname()

    if (!isVisible) return null

    return (
        <RefWrapper>
            <NavLink
                label={label}
                leftSection={icon}
                component={Link}
                href={url}
                active={pathname === url}
                c="white"
                color="blue.7"
                variant="filled"
                className={styles.navLinkHover}
            />
        </RefWrapper>
    )
}

export const NavbarItems: FC = () => {
    const { isLoaded, session } = useSession()

    if (!isLoaded) return null

    const { isAdmin, isResearcher, isReviewer } = session.team

    const isMultiple = (session.team.isResearcher && session.team.isReviewer) || session.team.isAdmin

    return (
        <Stack gap="sm">
            <OrgSwitcher />
            <OrgAdminDashboardLink isVisible={isAdmin} />
            <DashboardLink
                icon={<UserListIcon />}
                isVisible={isAdmin || isReviewer}
                url={`/reviewer/${session.team.slug}/dashboard`}
                label={`${isMultiple ? 'Reviewer‘s ' : ''}Dashboard`}
            />
            <DashboardLink
                icon={<StudentIcon />}
                isVisible={isAdmin || isResearcher}
                url={'/researcher/dashboard'}
                label={`${isMultiple ? 'Researcher‘s ' : ''}Dashboard`}
            />
        </Stack>
    )
}
