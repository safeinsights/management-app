'use client'

import { useQuery } from '@/common'
import { ENCLAVE_BG, LAB_BG } from '@/lib/constants'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { fetchUsersOrgsWithStatsAction } from '@/server/actions/org.actions'
import { AppShellNavbar, AppShellSection, Group, Stack } from '@mantine/core'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { NavOrgLinks } from './nav-org-links'
import { NavOrgsList } from './nav-orgs-list'
import { NavbarOrgSquares } from './navbar-org-squares'
import { NavbarProfileMenu } from './navbar-profile-menu'

export const AppNav: React.FC<{ isDesktop: boolean }> = ({ isDesktop: _isDesktop }) => {
    const path = usePathname()
    const { data: orgs = [] } = useQuery({
        queryFn: async () => fetchUsersOrgsWithStatsAction(),
        queryKey: ['orgs-with-stats'],
    })

    const sortedOrgs = useMemo(() => {
        if (!orgs) return []
        return [...orgs].sort((a, b) => a.name.localeCompare(b.name))
    }, [orgs])

    const isMainDashboard = path == '/dashboard'

    const focusedOrgSlug = extractOrgSlugFromPath(path)
    const focusedOrg = focusedOrgSlug ? sortedOrgs.find((o) => o.slug == focusedOrgSlug) : undefined
    const focusedOrgTheme = focusedOrg ? (focusedOrg.type === 'enclave' ? ENCLAVE_BG : LAB_BG) : undefined

    return (
        <AppShellNavbar bg={focusedOrgTheme || 'purple.8'}>
            <Group h="100%" gap={0}>
                <NavbarOrgSquares isMainDashboard={isMainDashboard} focusedOrgSlug={focusedOrgSlug} orgs={sortedOrgs} />
                <Stack h="100%" flex={1}>
                    <AppShellSection grow>
                        {isMainDashboard ? <NavOrgsList orgs={sortedOrgs} /> : <NavOrgLinks org={focusedOrg} />}
                    </AppShellSection>

                    <NavbarProfileMenu />
                </Stack>
            </Group>
        </AppShellNavbar>
    )
}
