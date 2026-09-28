import { orgSubnav, selectedSubnavUrl, type NavItem, type NavOrg } from '@/lib/nav/side-nav'
import { Routes } from '@/lib/routes'
import { NavRow } from './nav-row'
import styles from './side-nav.module.css'

const TYPE_LETTER: Record<NavOrg['type'], string> = { enclave: 'D', lab: 'R' }
const TYPE_NAME: Record<NavOrg['type'], string> = { enclave: 'Data partner', lab: 'Research lab' }

const OrgTypeBadge: React.FC<{ type: NavOrg['type'] }> = ({ type }) => (
    <span className={styles.typeBadge} role="img" aria-label={TYPE_NAME[type]}>
        {TYPE_LETTER[type]}
    </span>
)

const AdminPill: React.FC<{ isVisible: boolean }> = ({ isVisible }) => {
    if (!isVisible) return null
    return <span className={styles.adminPill}>Admin</span>
}

const SubnavRow: React.FC<{ item: NavItem; selectedUrl: string | null }> = ({ item, selectedUrl }) => (
    <li>
        <NavRow {...item} isSubnav isCurrent={item.url === selectedUrl} />
    </li>
)

type SubnavProps = {
    isVisible: boolean
    items: NavItem[]
    selectedUrl: string | null
}

const Subnav: React.FC<SubnavProps> = ({ isVisible, items, selectedUrl }) => {
    if (!isVisible) return null
    return (
        <ul className={styles.list}>
            {items.map((item) => (
                <SubnavRow key={item.url} item={item} selectedUrl={selectedUrl} />
            ))}
        </ul>
    )
}

type OrgGroupProps = {
    org: NavOrg
    focusedOrgSlug: string | null
    pathname: string
}

// Groups behave as an accordion keyed on the URL: only the org in the path is open, and the group
// row itself never reads as current — its open subnav already says so.
export const OrgGroup: React.FC<OrgGroupProps> = ({ org, focusedOrgSlug, pathname }) => {
    const isOpen = org.slug === focusedOrgSlug
    const items = orgSubnav(org)
    const selectedUrl = isOpen ? selectedSubnavUrl(pathname, items) : null

    return (
        <li className={styles.group}>
            <NavRow
                label={org.name}
                title={org.name}
                url={Routes.orgDashboard({ orgSlug: org.slug })}
                icon={<OrgTypeBadge type={org.type} />}
                rightSection={<AdminPill isVisible={org.isAdmin} />}
                isGroup
            />
            <Subnav isVisible={isOpen} items={items} selectedUrl={selectedUrl} />
        </li>
    )
}
