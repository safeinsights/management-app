import type { ReactNode } from 'react'
import { AppShellNavbar, AppShellSection, Box, Group, Stack } from '@mantine/core'
import Link from 'next/link'
import { Routes } from '@/lib/routes'
import type { ActionSuccessType } from '@/lib/types'
import type { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { NavbarOrgSquares } from './navbar-org-squares'
import { SafeInsightsLogo } from './svg/si-logo'

type Orgs = ActionSuccessType<typeof fetchUsersOrgsAction>

// Session-free so it renders in isolation; the Clerk-coupled pieces arrive through slots.
export type AppNavViewProps = {
    orgs: Orgs
    focusedOrgSlug?: string | null
    isMainDashboard: boolean
    isDesktop: boolean
    navbarBg: string
    navContent: ReactNode
    profileMenu: ReactNode
}

export function AppNavView({
    orgs,
    focusedOrgSlug,
    isMainDashboard,
    isDesktop,
    navbarBg,
    navContent,
    profileMenu,
}: AppNavViewProps) {
    return (
        <AppShellNavbar bg={navbarBg}>
            <Group h="100%" gap={0} wrap="nowrap">
                <NavbarOrgSquares isMainDashboard={isMainDashboard} focusedOrgSlug={focusedOrgSlug} orgs={orgs} />
                <Stack h="100%" flex={1}>
                    {isDesktop && (
                        <Box p={24}>
                            <Link href={Routes.home}>
                                <SafeInsightsLogo width={140} />
                            </Link>
                        </Box>
                    )}
                    <AppShellSection grow>{navContent}</AppShellSection>
                    {profileMenu}
                </Stack>
            </Group>
        </AppShellNavbar>
    )
}
