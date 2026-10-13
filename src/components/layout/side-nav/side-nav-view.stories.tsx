import type { Story } from '@ladle/react'
import { AppShellNavbar, Text } from '@mantine/core'
import { semanticColor } from '@/theme/tokens'
import type { NavOrg, NavUnread } from '@/lib/nav/side-nav'
import { Routes } from '@/lib/routes'
import { WithAppShell } from '~ladle/decorators/with-app-shell'
import { SideNavView } from './side-nav-view'

const meta = { title: 'Layout / Side Nav' }
export default meta

const ORGS: NavOrg[] = [
    { id: 'org-dp-admin', name: 'OpenStax Data', slug: 'openstax-data', type: 'enclave', isAdmin: true },
    { id: 'org-dp', name: 'EduData Partners', slug: 'edudata', type: 'enclave', isAdmin: false },
    { id: 'org-rl-admin', name: 'Mars University', slug: 'mars-university', type: 'lab', isAdmin: true },
    { id: 'org-rl', name: 'Westbrook University Research Consortium', slug: 'westbrook', type: 'lab', isAdmin: false },
]

const NOTHING_UNREAD: NavUnread = { myStudies: false, orgSlugs: [] }

const Shell: React.FC<{ focusedOrgSlug: string | null; pathname: string; unread?: NavUnread }> = ({
    focusedOrgSlug,
    pathname,
    unread = NOTHING_UNREAD,
}) => (
    <WithAppShell main={<Text c="dimmed">Page content sits beside the nav.</Text>}>
        <AppShellNavbar withBorder={false} bg={semanticColor('surface.sidenav')}>
            <SideNavView orgs={ORGS} focusedOrgSlug={focusedOrgSlug} pathname={pathname} unread={unread} />
        </AppShellNavbar>
    </WithAppShell>
)

export const MyStudies: Story = () => <Shell focusedOrgSlug={null} pathname={Routes.dashboard} />

export const DataPartnerAdmin: Story = () => (
    <Shell focusedOrgSlug="openstax-data" pathname={Routes.adminTeam({ orgSlug: 'openstax-data' })} />
)

export const ResearchLabAdmin: Story = () => (
    <Shell focusedOrgSlug="mars-university" pathname={Routes.orgDashboard({ orgSlug: 'mars-university' })} />
)

export const NonAdminStudyPage: Story = () => (
    <Shell focusedOrgSlug="westbrook" pathname={Routes.studyRequest({ orgSlug: 'westbrook' })} />
)

export const Unread: Story = () => (
    <Shell
        focusedOrgSlug={null}
        pathname={Routes.dashboard}
        unread={{ myStudies: true, orgSlugs: ['openstax-data', 'mars-university'] }}
    />
)
