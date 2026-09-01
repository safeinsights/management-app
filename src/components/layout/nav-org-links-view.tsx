import { orgInitialsTitle } from '@/lib/string'
import { ExternalLinks } from '@/lib/routes'
import { type ActionSuccessType, isEnclaveOrg } from '@/lib/types'
import type { fetchUsersOrgsAction } from '@/server/actions/org.actions'
import { Divider, Stack, Title } from '@mantine/core'
import { BookOpenIcon, BooksIcon, HouseIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { NavbarLink } from './navbar-link'

type Org = ActionSuccessType<typeof fetchUsersOrgsAction>[number]

type LinksProps = {
    org: Org
}

const EnclaveLinks: React.FC<LinksProps> = ({ org }) => (
    <>
        <NavbarLink isVisible={true} url={`/${org.slug}/dashboard`} label={org.name} icon={<HouseIcon size={16} />} />
        <NavbarLink
            icon={<BookOpenIcon />}
            isVisible={true}
            url={ExternalLinks.resourceCenter}
            label={'Resource Center'}
            newTab
        />
    </>
)

const LabLinks: React.FC<LinksProps> = ({ org }) => (
    <>
        <NavbarLink isVisible={true} url={`/${org.slug}/dashboard`} label={org.name} icon={<HouseIcon size={16} />} />
        <NavbarLink
            icon={<BooksIcon />}
            isVisible={true}
            url={ExternalLinks.dataCatalog}
            label={'Data Catalog'}
            newTab
        />
    </>
)

// Session-free so it renders in isolation; the container reads the session and passes
// `isOrgAdmin` in.
export type NavOrgLinksViewProps = {
    org: Org
    // OrgAdminDashboardLink reads route params, so the container injects it.
    adminLink: ReactNode
}

export const NavOrgLinksView: React.FC<NavOrgLinksViewProps> = ({ org, adminLink }) => {
    const isEnclave = isEnclaveOrg(org)

    return (
        <Stack>
            <Title c="white" py="md" px="sm" order={4}>
                {orgInitialsTitle(org.name, org.type)}
            </Title>
            <Divider />
            <NavbarLink isVisible={true} url="/dashboard" label="Home" icon={<HouseIcon size={16} />} />
            {isEnclave ? <EnclaveLinks org={org} /> : <LabLinks org={org} />}
            {adminLink}
        </Stack>
    )
}
