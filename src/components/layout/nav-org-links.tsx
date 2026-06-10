import { useSession } from '@/hooks/session'
import { type ActionSuccessType } from '@/lib/types'
import { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { NavOrgLinksView } from './nav-org-links-view'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'

type Org = ActionSuccessType<typeof fetchUsersOrgsAction>[number]

type Props = {
    org: Org
}

export const NavOrgLinks: React.FC<Partial<Props>> = ({ org }) => {
    const { session, isLoaded } = useSession()

    if (!org || !isLoaded) return null

    return (
        <NavOrgLinksView
            org={org}
            adminLink={<OrgAdminDashboardLink isVisible={session.orgs[org.slug]?.isAdmin} org={org} />}
        />
    )
}
