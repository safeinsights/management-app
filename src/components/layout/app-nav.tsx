'use client'

import { useQuery } from '@/common'
import { ENCLAVE_BG, LAB_BG } from '@/lib/constants'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { Routes } from '@/lib/routes'
import { fetchUsersOrgsWithStatsAction } from '@/server/actions/org.actions'
import { AppShellNavbar, AppShellSection, Box, Group, Stack } from '@mantine/core'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { NavOrgLinks } from './nav-org-links'
import { NavOrgsList } from './nav-orgs-list'
import { NavbarOrgSquares } from './navbar-org-squares'
import { NavbarProfileMenu } from './navbar-profile-menu'
import { SafeInsightsLogo } from './svg/si-logo'

export const AppNav: React.FC<{ isDesktop: boolean }> = ({ isDesktop }) => {
    const path = usePathname()
    const { data: orgs = [] } = useQuery({
        queryFn: async () => fetchUsersOrgsWithStatsAction(),
        queryKey: ['orgs-with-stats'],
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
        <AppShellNavbar bg={focusedOrgTheme || 'purple.8'}>
            <Group h="100%" gap={0} wrap="nowrap">
                <NavbarOrgSquares isMainDashboard={isMainDashboard} focusedOrgSlug={focusedOrgSlug} orgs={sortedOrgs} />
                <Stack h="100%" flex={1}>
                    {isDesktop && (
                        <Box p={24}>
                            <Link href={Routes.home}>
                                <SafeInsightsLogo width={140} />
                            </Link>
                        </Box>
                    )}
                    <AppShellSection grow>
                        {isMainDashboard ? <NavOrgsList orgs={sortedOrgs} /> : <NavOrgLinks org={focusedOrg} />}
                    </AppShellSection>

                    <NavbarProfileMenu />
                </Stack>
            </Group>
        </AppShellNavbar>
    )
}
