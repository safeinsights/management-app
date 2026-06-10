import type { Story } from '@ladle/react'
import { useState } from 'react'
import { Avatar, NavLink } from '@mantine/core'
import { GearIcon, LockIcon, SignOutIcon, SlidersIcon, UserIcon, UsersThreeIcon } from '@phosphor-icons/react/dist/ssr'
import { ENCLAVE_BG, LAB_BG } from '@/lib/constants'
import { Routes } from '@/lib/routes'
import type { ActionSuccessType } from '@/lib/types'
import type { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { WithAppShell } from '../../../.ladle/decorators/with-app-shell'
import { AppNavView } from './app-nav-view'
import { NavbarLink } from './navbar-link'
import { NavOrgLinksView } from './nav-org-links-view'
import { NavOrgsList } from './nav-orgs-list'
import { NavbarProfileMenuView } from './navbar-profile-menu-view'
import styles from './navbar-items.module.css'

// The app-shell left sidebar, rendered TRUE TO LIFE inside the real <AppShell> chrome (so the
// AppShellNavbar sits at the right width over the grey canvas). AppNavView is presentational;
// the session/path-derived data is supplied here as fixtures and the Clerk-coupled profile menu
// is replaced by a session-free NavbarProfileMenuView with plain fixture items.
const meta = { title: 'Layout / App Sidebar' }
export default meta

type Orgs = ActionSuccessType<typeof fetchUsersOrgsAction>

const ORGS: Orgs = [
    { id: 'org-lab', name: 'Mars University', slug: 'mars-university', type: 'lab' },
    { id: 'org-enclave', name: 'OpenStax Data', slug: 'openstax-data', type: 'enclave' },
]

// Session-free stand-in for NavbarProfileMenu: drives the pure view's open/closed state and
// supplies fixture menu rows (the real container builds these from Clerk roles).
function ProfileMenuFixture({ defaultOpened = false }: { defaultOpened?: boolean }) {
    const [opened, setOpened] = useState(defaultOpened)
    const items = (
        <>
            <NavLink
                label="Profile"
                leftSection={<UserIcon aria-hidden="true" />}
                c="white"
                className={styles.navLinkProfileHover}
                role="menuitem"
                component="button"
            />
            <NavLink
                label="Settings"
                leftSection={<GearIcon aria-hidden="true" />}
                c="white"
                className={styles.navLinkProfileHover}
                role="menuitem"
                component="button"
            />
            <NavLink
                label="Reviewer Key"
                leftSection={<LockIcon aria-hidden="true" />}
                c="white"
                className={styles.navLinkProfileHover}
                role="menuitem"
                component="button"
            />
            <NavLink
                label="Sign Out"
                leftSection={<SignOutIcon aria-hidden="true" />}
                c="white"
                className={styles.navLinkProfileHover}
                role="menuitem"
                component="button"
            />
        </>
    )
    return (
        <NavbarProfileMenuView
            opened={opened}
            onToggle={() => setOpened((o) => !o)}
            userName={<>Hi, Ada</>}
            avatar={<Avatar bg="purple.3" color="gray.1" name="AL" alt="User profile" />}
            menuItems={items}
        />
    )
}

// Session/route-free stand-in for OrgAdminDashboardLink (which reads useParams for the org
// slug). Uses the fixture org's slug so the Routes are valid; shown expanded.
function AdminLinkFixture({ org }: { org: Orgs[number] }) {
    return (
        <NavLink
            label="Admin"
            leftSection={<GearIcon />}
            component="button"
            defaultOpened
            c="white"
            className={styles.navLinkHover}
            rightSection={null}
        >
            <NavbarLink
                isVisible
                label="Team"
                icon={<UsersThreeIcon size={20} />}
                url={Routes.adminTeam({ orgSlug: org.slug })}
                pl="xl"
            />
            <NavbarLink
                isVisible={org.type !== 'lab'}
                label="Settings"
                icon={<SlidersIcon size={20} />}
                url={Routes.adminSettings({ orgSlug: org.slug })}
                pl="xl"
            />
        </NavLink>
    )
}

export const PersonalDashboard: Story = () => (
    <WithAppShell>
        <AppNavView
            orgs={ORGS}
            focusedOrgSlug={null}
            isMainDashboard={true}
            isDesktop={true}
            navbarBg="purple.8"
            navContent={<NavOrgsList orgs={ORGS} />}
            profileMenu={<ProfileMenuFixture />}
        />
    </WithAppShell>
)

export const InsideLabOrg: Story = () => (
    <WithAppShell>
        <AppNavView
            orgs={ORGS}
            focusedOrgSlug="mars-university"
            isMainDashboard={false}
            isDesktop={true}
            navbarBg={LAB_BG}
            navContent={<NavOrgLinksView org={ORGS[0]} adminLink={<AdminLinkFixture org={ORGS[0]} />} />}
            profileMenu={<ProfileMenuFixture />}
        />
    </WithAppShell>
)

export const InsideDataOrg: Story = () => (
    <WithAppShell>
        <AppNavView
            orgs={ORGS}
            focusedOrgSlug="openstax-data"
            isMainDashboard={false}
            isDesktop={true}
            navbarBg={ENCLAVE_BG}
            navContent={<NavOrgLinksView org={ORGS[1]} adminLink={<AdminLinkFixture org={ORGS[1]} />} />}
            profileMenu={<ProfileMenuFixture />}
        />
    </WithAppShell>
)

export const ProfileMenuExpanded: Story = () => (
    <WithAppShell>
        <AppNavView
            orgs={ORGS}
            focusedOrgSlug={null}
            isMainDashboard={true}
            isDesktop={true}
            navbarBg="purple.8"
            navContent={<NavOrgsList orgs={ORGS} />}
            profileMenu={<ProfileMenuFixture defaultOpened />}
        />
    </WithAppShell>
)
