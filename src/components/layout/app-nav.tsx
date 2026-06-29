'use client'

import { useQuery } from '@/common'
import { ENCLAVE_BG, LAB_BG } from '@/lib/constants'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { AppNavView } from './app-nav-view'
import { NavOrgLinks } from './nav-org-links'
import { NavOrgsList } from './nav-orgs-list'
import { NavbarProfileMenu } from './navbar-profile-menu'

export const AppNav: React.FC<{ isDesktop: boolean }> = ({ isDesktop }) => {
    const path = usePathname()
    const { data: orgs = [] } = useQuery({
        queryFn: async () => fetchUsersOrgsAction(),
        queryKey: ['user-orgs'],
    })

    const sortedOrgs = useMemo(() => {
        if (!orgs) return []
        return [...orgs].sort((a, b) => a.name.localeCompare(b.name))
    }, [orgs])

    const focusedOrgSlug = extractOrgSlugFromPath(path)
    const isMainDashboard = path == '/dashboard' || !focusedOrgSlug
    const focusedOrg = focusedOrgSlug ? sortedOrgs.find((o) => o.slug == focusedOrgSlug) : undefined
    const focusedOrgTheme = focusedOrg ? (focusedOrg.type === 'enclave' ? ENCLAVE_BG : LAB_BG) : undefined

    return (
        <AppNavView
            orgs={sortedOrgs}
            focusedOrgSlug={focusedOrgSlug}
            isMainDashboard={isMainDashboard}
            isDesktop={isDesktop}
            navbarBg={focusedOrgTheme || 'purple.8'}
            navContent={isMainDashboard ? <NavOrgsList orgs={sortedOrgs} /> : <NavOrgLinks org={focusedOrg} />}
            profileMenu={<NavbarProfileMenu />}
        />
    )
}
