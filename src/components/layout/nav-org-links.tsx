import { useSession } from '@/hooks/session'
import { orgInitialsTitle } from '@/lib/string'
import { ActionSuccessType, isEnclaveOrg } from '@/lib/types'
import { fetchUsersOrgsWithStatsAction } from '@/server/actions/org.actions'
import { Divider, Stack, Title } from '@mantine/core'
import { BookOpenIcon, BooksIcon, HouseIcon } from '@phosphor-icons/react'
import { NavbarLink } from './navbar-link'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'

type Org = ActionSuccessType<typeof fetchUsersOrgsWithStatsAction>[number]

type Props = {
    org: Org
}

const EnclaveLinks: React.FC<Props> = ({ org }) => {
    return (
        <>
            <NavbarLink
                isVisible={true}
                url={`/${org.slug}/dashboard`}
                label={org.name}
                icon={<HouseIcon size={16} />}
            />
            <NavbarLink
                icon={<BookOpenIcon />}
                isVisible={true}
                url={'https://kb.safeinsights.org/resource-center'}
                label={'Resource Center'}
                newTab
            />
        </>
    )
}

const LabLinks: React.FC<Props> = ({ org }) => {
    return (
        <>
            <NavbarLink
                isVisible={true}
                url={`/${org.slug}/dashboard`}
                label={org.name}
                icon={<HouseIcon size={16} />}
            />
            <NavbarLink
                icon={<BooksIcon />}
                isVisible={true}
                url={'https://kb.safeinsights.org/data-catalog'}
                label={'Data Catalog'}
                newTab
            />
        </>
    )
}

export const NavOrgLinks: React.FC<Partial<Props>> = ({ org }) => {
    const { session, isLoaded } = useSession()

    if (!org || !isLoaded) return null

    const isEnclave = isEnclaveOrg(org)

    return (
        <Stack>
            <Title c="white" py="md" px="sm" order={4}>
                {orgInitialsTitle(org.name, org.type)}
            </Title>
            <Divider />
            <NavbarLink isVisible={true} url="/dashboard" label="Home" icon={<HouseIcon size={16} />} />
            {isEnclave ? <EnclaveLinks org={org} /> : <LabLinks org={org} />}
            <OrgAdminDashboardLink isVisible={session.orgs[org.slug]?.isAdmin} org={org} />
        </Stack>
    )
}
