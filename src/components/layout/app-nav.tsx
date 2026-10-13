'use client'

import { useQuery } from '@/common'
import { useSession } from '@/hooks/session'
import { NAV_UNREAD_QUERY_KEY, NOTHING_UNREAD, orderNavOrgs, type NavUnread } from '@/lib/nav/side-nav'
import { extractOrgSlugFromPath } from '@/lib/paths'
import { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { fetchNavUnreadAction } from '@/server/actions/study.actions'
import { semanticColor } from '@/theme/tokens'
import { AppShellNavbar, Burger, Group } from '@mantine/core'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { SideNavView } from './side-nav/side-nav-view'

type Props = {
    isOpened: boolean
    onToggle: () => void
}

// Keyed by user, so an account switch that keeps the query client never shows the last user's dots.
function useNavUnread(): NavUnread {
    const { session } = useSession()
    const userId = session?.user.id
    const { data = NOTHING_UNREAD } = useQuery({
        queryKey: [...NAV_UNREAD_QUERY_KEY, userId],
        queryFn: async () => fetchNavUnreadAction(),
        enabled: Boolean(userId),
        refetchOnWindowFocus: false,
    })
    return data
}

export const AppNav: React.FC<Props> = ({ isOpened, onToggle }) => {
    const pathname = usePathname()
    const { data: orgs = [] } = useQuery({
        queryFn: async () => fetchUsersOrgsAction(),
        queryKey: ['user-orgs'],
    })

    const unread = useNavUnread()

    const orderedOrgs = useMemo(() => orderNavOrgs(orgs), [orgs])
    const focusedOrgSlug = extractOrgSlugFromPath(pathname)

    return (
        <AppShellNavbar withBorder={false} bg={semanticColor('surface.sidenav')}>
            {/* The alt layout runs the open mobile nav over the bar, so its own burger closes it. */}
            <Group hiddenFrom="sm" justify="flex-end" px="md" pt="md">
                <Burger
                    opened={isOpened}
                    onClick={onToggle}
                    size="sm"
                    color={semanticColor('text.white')}
                    aria-label="Close navigation"
                />
            </Group>
            <SideNavView orgs={orderedOrgs} focusedOrgSlug={focusedOrgSlug} pathname={pathname} unread={unread} />
        </AppShellNavbar>
    )
}
