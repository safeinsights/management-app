'use client'

import { NavbarProfileMenu } from './navbar-profile-menu'
import { useQuery } from '@/common'
import { Stack, AppShellNavbar, AppShellSection, Group } from '@mantine/core'
import { usePathname } from 'next/navigation'
import { fetchOrgsWithStatsAction } from '@/server/actions/org.actions'
import { NavbarOrgSquares } from './navbar-org-squares'
import { NavOrgsList } from './nav-orgs-list'
import { NavOrgLinks } from './nav-org-links'
import { extractOrgSlugFromPath } from '@/lib/paths'

export const AppNav: React.FC<{ isDesktop: boolean }> = ({ isDesktop: _isDesktop }) => {
    const path = usePathname()

    const { data: orgs } = useQuery({
        placeholderData: [],
        queryFn: async () => fetchOrgsWithStatsAction(),
        queryKey: ['orgs-with-stats'],
    })

    const isMainDashboard = path == '/dashboard'

    const focusedOrgSlug = extractOrgSlugFromPath(path)
    const focusedOrg = focusedOrgSlug && orgs ? orgs.find((o) => o.slug == focusedOrgSlug) : undefined

    return (
        <AppShellNavbar bg="purple.8">
            <Group h="100%" gap={0}>
                <NavbarOrgSquares isMainDashboard={isMainDashboard} focusedOrgSlug={focusedOrgSlug} orgs={orgs || []} />
                <Stack h="100%" flex={1}>
                    <AppShellSection grow>
                        {isMainDashboard ? <NavOrgsList orgs={orgs || []} /> : <NavOrgLinks org={focusedOrg} />}
                    </AppShellSection>

                    <NavbarProfileMenu />
                </Stack>
            </Group>
        </AppShellNavbar>
    )
}
