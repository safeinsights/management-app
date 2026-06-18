import type { ReactNode } from 'react'
import { AppShellNavbar, AppShellSection, Box, Group, Stack } from '@mantine/core'
import Link from 'next/link'
import { Routes } from '@/lib/routes'
import type { ActionSuccessType } from '@/lib/types'
import type { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { NavbarOrgSquares } from './navbar-org-squares'
import { SafeInsightsLogo } from './svg/si-logo'

type Orgs = ActionSuccessType<typeof fetchUsersOrgsAction>

// Presentational sidebar. It owns the navbar chrome, the org-squares rail, the logo, and the
// layout of the nav-content + profile-menu — but NOT the session, the path, or the user-orgs
// fetch. The session/Clerk-coupled pieces (the org-links list with its admin gate, and the
// profile menu) are injected via the `navContent` and `profileMenu` slots so this view renders
// in isolation (e.g. Ladle). The AppNav container (./app-nav) derives the data and supplies them.
export type AppNavViewProps = {
    orgs: Orgs
    focusedOrgSlug?: string | null
    isMainDashboard: boolean
    isDesktop: boolean
    /** Resolved navbar background — focused org's type color, or the default purple. */
    navbarBg: string
    /** Session-aware nav body: the personal org list or the focused-org links. */
    navContent: ReactNode
    /** Clerk-coupled profile menu pinned to the bottom of the sidebar. */
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
