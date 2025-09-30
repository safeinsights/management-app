import { ActionSuccessType, isEnclaveOrg } from '@/lib/types'
import { fetchOrgsWithStatsAction } from '@/server/actions/org.actions'
import { Divider, Stack, Title } from '@mantine/core'
import { NavbarLink } from './navbar-link'
import { BookOpenIcon, BooksIcon, HouseIcon } from '@phosphor-icons/react'
import { OrgAdminDashboardLink } from './org-admin-dashboard-link'
import { useSession } from '@/hooks/session'

type Org = ActionSuccessType<typeof fetchOrgsWithStatsAction>[number]

type Props = {
    org: Org
}

const EnclaveLinks: React.FC<Props> = ({ org }) => {
    return (
        <>
            <NavbarLink
                isVisible={true}
                url={`/dashboard/${org.slug}`}
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
                url={`/dashboard/${org.slug}`}
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
                {org.name}
            </Title>
            <Divider />
            {isEnclave ? <EnclaveLinks org={org} /> : <LabLinks org={org} />}
            <OrgAdminDashboardLink isVisible={!session.orgs[org.slug]?.isAdmin} />
        </Stack>
    )
}
