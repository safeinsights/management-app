import { orgSubnav, selectedSubnavUrl, type NavItem, type NavOrg } from '@/lib/nav/side-nav'
import { Routes } from '@/lib/routes'
import { NavRow } from './nav-row'
import styles from './side-nav.module.css'

const TYPE_NAME: Record<NavOrg['type'], string> = { enclave: 'Data partner', lab: 'Research lab' }

// Figma Icon/DP and Icon/RL. The D is cut out of a filled square, so the hole shows the row's own
// fill in every state; the R sits inside an outlined square.
const TYPE_ICON_PATH: Record<NavOrg['type'], string> = {
    enclave:
        'M14.5 1C14.7761 1 15 1.22386 15 1.5V14.5C15 14.7761 14.7761 15 14.5 15H1.5C1.22386 15 1 14.7761 1 14.5V1.5C1 1.22386 1.22386 1 1.5 1H14.5ZM5 11.9404H7.58984C8.08984 11.9404 8.5538 11.853 8.98047 11.6797C9.41345 11.5064 9.78646 11.2633 10.0996 10.9502C10.4129 10.6369 10.6567 10.2696 10.8301 9.84961C11.01 9.42304 11.0996 8.96292 11.0996 8.46973C11.0996 7.96983 11.01 7.50977 10.8301 7.08984C10.6568 6.6699 10.4098 6.30353 10.0898 5.99023C9.77651 5.6769 9.40306 5.4331 8.96973 5.25977C8.54323 5.08655 8.07673 5.00004 7.57031 5H5V11.9404ZM7.5498 5.86035C8.05644 5.86035 8.503 5.97046 8.88965 6.19043C9.27632 6.41043 9.5798 6.71702 9.7998 7.11035C10.0197 7.50363 10.1299 7.95339 10.1299 8.45996C10.1299 8.97329 10.0198 9.42698 9.7998 9.82031C9.58654 10.2134 9.28681 10.5234 8.90039 10.75C8.51372 10.97 8.06314 11.0801 7.5498 11.0801H5.94043V5.86035H7.5498Z',
    lab: 'M14.5 1C14.7761 1 15 1.22386 15 1.5V14.5C15 14.7761 14.7761 15 14.5 15H1.5C1.22386 15 1 14.7761 1 14.5V1.5C1 1.22386 1.22386 1 1.5 1H14.5ZM2 14H14V2H2V14ZM8.0498 4.5C8.4898 4.5 8.87353 4.58643 9.2002 4.75977C9.52683 4.92643 9.77687 5.15688 9.9502 5.4502C10.1301 5.74346 10.2197 6.08008 10.2197 6.45996C10.2197 6.85329 10.1302 7.1969 9.9502 7.49023C9.77691 7.78344 9.52669 8.01305 9.2002 8.17969C8.91052 8.32157 8.57606 8.39995 8.19727 8.41602L10.6904 11.4404H9.5L7.05371 8.41992H6.44043V11.4404H5.5V4.5H8.0498ZM6.44043 7.62988H8.00977C8.4164 7.62988 8.7302 7.52695 8.9502 7.32031C9.1701 7.11374 9.28018 6.83358 9.28027 6.48047C9.28027 6.14728 9.17 5.87034 8.9502 5.65039C8.73686 5.43039 8.4262 5.32031 8.01953 5.32031H6.44043V7.62988Z',
}

const OrgTypeIcon: React.FC<{ type: NavOrg['type'] }> = ({ type }) => (
    <span className={styles.typeIcon} role="img" aria-label={TYPE_NAME[type]}>
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d={TYPE_ICON_PATH[type]} fill="currentColor" fillRule="evenodd" />
        </svg>
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
    const selectedUrl = isOpen ? selectedSubnavUrl(pathname, org) : null

    return (
        <li className={styles.group}>
            <NavRow
                label={org.name}
                title={org.name}
                url={Routes.orgDashboard({ orgSlug: org.slug })}
                icon={<OrgTypeIcon type={org.type} />}
                rightSection={<AdminPill isVisible={org.isAdmin} />}
                isGroup
            />
            <Subnav isVisible={isOpen} items={items} selectedUrl={selectedUrl} />
        </li>
    )
}
