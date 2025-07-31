'use client'

import { FC } from 'react'
import { Stack } from '@mantine/core'
import { StudentIcon, UserListIcon } from '@phosphor-icons/react/dist/ssr'
import { useSession } from '@/hooks/session'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { OrgSwitcher } from '../org/org-switcher'
import { NavbarLink } from './navbar-link'

export const NavbarItems: FC = () => {
    const { isLoaded, session } = useSession()

    if (!isLoaded) return null

    const { isAdmin, isResearcher, isReviewer } = session.team

    const isMultiple = (session.team.isResearcher && session.team.isReviewer) || session.team.isAdmin

    return (
        <Stack gap="sm">
            <OrgSwitcher />
            <OrgAdminDashboardLink isVisible={isAdmin} />
            <NavbarLink
                icon={<UserListIcon />}
                isVisible={isAdmin || isReviewer}
                url={`/reviewer/${session.team.slug}/dashboard`}
                label={`${isMultiple ? 'Reviewer‘s ' : ''}Dashboard`}
            />
            <NavbarLink
                icon={<StudentIcon />}
                isVisible={isAdmin || isResearcher}
                url={'/researcher/dashboard'}
                label={`${isMultiple ? 'Researcher‘s ' : ''}Dashboard`}
            />
        </Stack>
    )
}
